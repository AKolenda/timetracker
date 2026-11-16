import type { TimeEntry } from "./types.ts"
import { normalizeBillFactor } from "./billing.ts"

/**
 * The invoice preview's AI chat. The browser sends the client's unbilled entries and the
 * conversation; the model answers with a reply and, when asked to change something, one
 * proposal. Nothing is written until the person presses Apply, which runs in the browser
 * through the store, so the preview, the time log and the Create invoice dialog agree.
 */

export type ChatTurn = { role: "user" | "assistant"; text: string }
export type ChatSuggestion = { label: string; prompt: string }
export type InvoiceProposal = {
  title: string
  /** Entries sharing a label bill as one invoice line. */
  group: { label: string; entryIds: string[] }[]
  /** Entries put back on their own lines. */
  ungroup: string[]
  delete: string[]
  billFactor: { factor: number; entryIds: string[] }[]
  rename: { entryId: string; description: string }[]
}
export type InvoiceChatAnswer = { reply: string; proposal: InvoiceProposal | null; suggestions: ChatSuggestion[] }
export type ChatStep = { id: string; label: string; status: "running" | "done" | "failed"; ms?: number }
export type ChatStreamEvent =
  | { type: "step"; step: ChatStep }
  | { type: "answer"; answer: InvoiceChatAnswer; provider: string }
  | { type: "error"; message: string }

/** One unbilled entry, as the browser sends it. */
export type ChatEntry = {
  id: string
  projectId: string
  projectName: string
  rate: number
  date: string
  /** Local "HH:mm–HH:mm". */
  time: string
  duration: number
  billFactor: number
  description: string
  invoiceLine: string | null
  /** Titles of the agent chats behind the entry. */
  chats: string[]
}

export type ChatRequest = { clientName: string; currency: string; today: string; entries: ChatEntry[]; turns: ChatTurn[] }

export const MAX_TURNS = 16
export const MAX_ENTRIES = 600

export function emptyProposal(title = ""): InvoiceProposal {
  return { title, group: [], ungroup: [], delete: [], billFactor: [], rename: [] }
}

/** The entries as they would be after the proposal; deleted entries are gone. */
export function applyProposal(entries: TimeEntry[], proposal: InvoiceProposal): TimeEntry[] {
  const removed = new Set(proposal.delete)
  const patch = new Map<string, Partial<TimeEntry>>()
  const add = (id: string, update: Partial<TimeEntry>) => patch.set(id, { ...patch.get(id), ...update })
  for (const id of proposal.ungroup) add(id, { invoiceLine: null })
  for (const group of proposal.group) for (const id of group.entryIds) add(id, { invoiceLine: group.label })
  for (const change of proposal.billFactor) for (const id of change.entryIds) add(id, { billFactor: change.factor })
  for (const change of proposal.rename) add(change.entryId, { description: change.description })
  return entries.filter((entry) => !removed.has(entry.id)).map((entry) => (patch.has(entry.id) ? { ...entry, ...patch.get(entry.id) } : entry))
}

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : word === "entry" ? "entries" : `${word}s`}`

/** Plain lines for the change card, such as "Group 80 entries into 17 lines". */
export function describeProposal(proposal: InvoiceProposal): string[] {
  const lines: string[] = []
  const grouped = proposal.group.reduce((total, group) => total + group.entryIds.length, 0)
  if (grouped) lines.push(`Group ${plural(grouped, "entry")} into ${plural(proposal.group.length, "line")}`)
  if (proposal.ungroup.length) lines.push(`Put ${plural(proposal.ungroup.length, "entry")} back on their own lines`)
  for (const change of proposal.billFactor) lines.push(`Charge ${Math.round(change.factor * 100)}% of ${plural(change.entryIds.length, "entry")}`)
  if (proposal.rename.length) lines.push(`Rename ${plural(proposal.rename.length, "entry")}`)
  if (proposal.delete.length) lines.push(`Delete ${plural(proposal.delete.length, "entry")} from the time log`)
  return lines
}

export const proposalIsEmpty = (proposal: InvoiceProposal) => describeProposal(proposal).length === 0

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "")

/**
 * Reads the model's JSON answer and keeps only what can be applied: known entry ids, each
 * entry in at most one of group, ungroup and delete, factors from 0 to 1, and non-empty labels.
 * `ids` maps the short ids the model saw (e1, e2…) to entry ids.
 */
export function parseAnswer(raw: string, ids: Map<string, string>): InvoiceChatAnswer {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  let data: Record<string, unknown> | null = null
  if (start >= 0 && end > start) {
    try {
      data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
    } catch {
      data = null
    }
  }
  if (!data) return { reply: raw.trim().slice(0, 4000) || "I couldn't answer that. Try asking again.", proposal: null, suggestions: [] }

  const resolve = (value: unknown) => {
    const list = Array.isArray(value) ? value : []
    return [...new Set(list.map((id) => ids.get(String(id).trim())).filter((id): id is string => Boolean(id)))]
  }
  const claimed = new Set<string>()
  const claim = (list: string[]) => list.filter((id) => (claimed.has(id) ? false : (claimed.add(id), true)))

  let proposal: InvoiceProposal | null = null
  const p = data.proposal
  if (p && typeof p === "object") {
    const source = p as Record<string, unknown>
    const draft = emptyProposal(text(source.title, 120) || "Change these entries")
    draft.delete = claim(resolve(source.delete))
    for (const group of Array.isArray(source.group) ? source.group : []) {
      const label = text((group as Record<string, unknown>)?.label, 120)
      const entryIds = claim(resolve((group as Record<string, unknown>)?.entryIds))
      if (label && entryIds.length) draft.group.push({ label, entryIds })
    }
    draft.ungroup = claim(resolve(source.ungroup))
    const removed = new Set(draft.delete)
    for (const change of Array.isArray(source.billFactor) ? source.billFactor : []) {
      const factor = Number((change as Record<string, unknown>)?.factor)
      const entryIds = resolve((change as Record<string, unknown>)?.entryIds).filter((id) => !removed.has(id))
      if (Number.isFinite(factor) && factor >= 0 && factor <= 1 && entryIds.length) draft.billFactor.push({ factor: normalizeBillFactor(factor), entryIds })
    }
    for (const change of Array.isArray(source.rename) ? source.rename : []) {
      const [entryId] = resolve([(change as Record<string, unknown>)?.entryId])
      const description = text((change as Record<string, unknown>)?.description, 200)
      if (entryId && description && !removed.has(entryId)) draft.rename.push({ entryId, description })
    }
    if (!proposalIsEmpty(draft)) proposal = draft
  }

  const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : [])
    .map((item) => ({ label: text((item as Record<string, unknown>)?.label, 40), prompt: text((item as Record<string, unknown>)?.prompt, 300) }))
    .filter((item) => item.label && item.prompt)
    .slice(0, 3)
  const reply = typeof data.reply === "string" && data.reply.trim() ? data.reply.trim().slice(0, 4000) : proposal ? "Here's what I'd change." : "Done."
  return { reply, proposal, suggestions }
}
