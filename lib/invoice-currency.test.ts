import assert from "node:assert/strict"
import test from "node:test"
import {
  formatWithCode,
  needsFxLock,
  parseSecondaryRemittance,
  paymentAccounts,
  rateNote,
  secondaryCurrencyFor,
  secondaryTotal,
} from "./invoice-currency.ts"

const aud = parseSecondaryRemittance({
  currency: "aud",
  accountName: "Jane Doe",
  bankName: "Wise",
  routingNumber: "774-001",
  accountNumber: "12345678",
  notes: "PayID: jane@example.com",
})
const usd = { firstName: "Jane", lastName: "Doe", bankName: "Chase", routingNumber: "021000021", accountNumber: "9876" }

test("only clients who opted in get the second currency", () => {
  assert.equal(secondaryCurrencyFor(true, aud), "AUD")
  assert.equal(secondaryCurrencyFor(false, aud), null)
  assert.equal(secondaryCurrencyFor(true, parseSecondaryRemittance({})), null)
  // USD can't be its own second currency, and junk codes are dropped.
  assert.equal(parseSecondaryRemittance({ currency: "USD" }).currency, "")
  assert.equal(parseSecondaryRemittance({ currency: "dollars" }).currency, "")
})

test("a draft uses today's rate until a rate is locked", () => {
  const draft = { total: 1500, fxCurrency: null, fxRate: null, fxRateDate: null }
  assert.equal(needsFxLock(draft, "AUD"), true)
  assert.equal(needsFxLock(draft, null), false)
  const live = secondaryTotal(draft, "AUD", aud, { rate: 1.4269, date: "2026-11-02" })
  assert.deepEqual(
    live && { amount: live.amount, locked: live.locked, account: live.account?.bankName },
    { amount: 2140.35, locked: false, account: "Wise" }
  )
  assert.equal(secondaryTotal(draft, "AUD", aud, null), null)
})

test("an issued invoice keeps its locked rate, even if the client later opts out", () => {
  const sent = { total: 1500, fxCurrency: "AUD", fxRate: 1.5, fxRateDate: "2026-10-01" }
  assert.equal(needsFxLock(sent, "AUD"), false)
  const locked = secondaryTotal(sent, null, aud, { rate: 9, date: "2026-11-02" })
  assert.equal(locked?.amount, 2250)
  assert.equal(locked?.locked, true)
  assert.equal(rateNote(locked!), "1 USD = 1.5000 AUD (ECB reference rate, Oct 1, 2026)")
})

test("USD-only invoices keep the single untitled remittance block", () => {
  const accounts = paymentAccounts(usd, 1500, null)
  assert.equal(accounts.length, 1)
  assert.equal(accounts[0].heading, "")
  assert.deepEqual(accounts[0].lines.map((l) => l.label), ["Pay to", "Bank", "Routing", "Account"])
})

test("dual-currency invoices list USD first, then the second account with its amount", () => {
  const secondary = secondaryTotal({ total: 1500 }, "AUD", aud, { rate: 1.4269, date: "2026-11-02" })
  const accounts = paymentAccounts(usd, 1500, secondary)
  assert.deepEqual(
    accounts.map((a) => [a.heading, a.amount]),
    [
      ["Pay in USD", formatWithCode(1500, "USD")],
      ["Or pay in AUD", formatWithCode(2140.35, "AUD")],
    ]
  )
  assert.equal(accounts[1].lines.find((l) => l.label === "BSB")?.value, "774-001")
  assert.equal(formatWithCode(2140.35, "AUD"), "AUD 2,140.35")
})
