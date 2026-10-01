import type { AgentTimeSourceInterval } from "./agent-time"
import { conversationKey, groupConversationSources } from "./agent-time-chats.ts"

export const BILL_FACTOR_PRESETS = [
  { label: "100%", value: 1 },
  { label: "½", value: 0.5 },
  { label: "⅓", value: 1 / 3 },
]

/** Billing factors are a share of the tracked time, from 0 (free) to 1 (full rate). */
export function normalizeBillFactor(value: unknown) {
  const factor = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(factor)) return 1
  return Math.round(Math.min(1, Math.max(0, factor)) * 10_000) / 10_000
}

export function billedSeconds(entry: { duration: number; billFactor?: number }) {
  return Math.round(entry.duration * normalizeBillFactor(entry.billFactor ?? 1))
}

export function formatBillFactor(factor: number) {
  const preset = BILL_FACTOR_PRESETS.find((option) => Math.abs(option.value - factor) < 0.0001)
  return preset && preset.value !== 1 ? preset.label : `${Math.round(factor * 1000) / 10}%`
}

/** Weights each chat's factor by the time it was active inside the interval. */
export function sourcesBillFactor(
  sources: AgentTimeSourceInterval[],
  start: number,
  end: number,
  chatFactors: Record<string, number> = {}
) {
  let seconds = 0
  let weighted = 0
  for (const chat of groupConversationSources(sources, start, end)) {
    seconds += chat.durationSeconds
    weighted += chat.durationSeconds * normalizeBillFactor(chatFactors[conversationKey(chat)] ?? 1)
  }
  return seconds > 0 ? normalizeBillFactor(weighted / seconds) : 1
}
