import {
  formatWithCode,
  rateNote,
  type PaymentAccount,
  type SecondaryTotal,
} from "@/lib/invoice-currency"

/** The remittance box on the on-screen invoice; one untitled block for USD-only invoices. */
export function PaymentOptions({ accounts }: { accounts: PaymentAccount[] }) {
  if (!accounts.length) return null
  return (
    <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-5">
      <p className="mb-3 text-[11px] font-bold tracking-wider text-gray-500 uppercase">
        {accounts.length > 1 ? "Payment Options" : "Remittance Information"}
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {accounts.map((account) => (
          <div
            key={account.heading}
            className={accounts.length > 1 ? "" : "sm:col-span-2"}
          >
            {account.heading && (
              <p className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold">
                <span>{account.heading}</span>
                <span className="font-mono">{account.amount}</span>
              </p>
            )}
            {account.lines.map((line) => (
              <p key={line.label} className="text-sm break-words">
                <span className="text-gray-500">{line.label}: </span>
                <span className={line.mono ? "font-mono" : undefined}>
                  {line.value}
                </span>
              </p>
            ))}
            {account.notes && (
              <p className="mt-2 text-xs whitespace-pre-line text-gray-500">
                {account.notes}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The converted total under the USD total, with the rate it used. */
export function SecondaryTotalRow({ secondary }: { secondary: SecondaryTotal }) {
  return (
    <>
      <div className="flex justify-between gap-4 pt-1 text-sm">
        <span className="text-gray-500">Total in {secondary.currency}</span>
        <span className="font-mono font-semibold">
          {formatWithCode(secondary.amount, secondary.currency)}
        </span>
      </div>
      <p className="mt-1 text-right text-[11px] text-gray-400">
        {rateNote(secondary)}
      </p>
    </>
  )
}
