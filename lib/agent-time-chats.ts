import type { AgentTimeSourceInterval } from "./agent-time"
import type { TimeRange } from "./agent-time-overlap"

/** Identifies one chat across machines and linked T3/native sessions. */
export function conversationKey(interval: AgentTimeSourceInterval) {
  return `${interval.hostUrl || ""}:${interval.canonicalConversationId ? `chat:${interval.canonicalConversationId}` : `${interval.source}:${interval.conversationId || interval.conversationTitle || interval.model || interval.agent}`}`
}

export function groupConversationSources(
  intervals: AgentTimeSourceInterval[],
  sliceStart: number,
  sliceEnd: number
) {
  const conversations = new Map<string, AgentTimeSourceInterval & { spans: TimeRange[] }>()
  for (const interval of intervals) {
    const start = Math.max(new Date(interval.start).getTime(), sliceStart)
    const end = Math.min(new Date(interval.end).getTime(), sliceEnd)
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue
    const key = conversationKey(interval)
    const current = conversations.get(key)
    if (current) {
      current.spans.push({ start, end })
      if (!current.model && interval.model) current.model = interval.model
      // The T3 transcript has the user's original conversation and saved title.
      if (interval.source === "T3 Code") {
        current.source = interval.source
        current.conversationId = interval.conversationId
        current.conversationTitle = interval.conversationTitle
      }
    }
    else conversations.set(key, { ...interval, spans: [{ start, end }] })
  }

  return [...conversations.values()].map((conversation) => {
    const spans = [...conversation.spans].sort((a, b) => a.start - b.start)
    const merged: TimeRange[] = []
    for (const span of spans) {
      const previous = merged.at(-1)
      if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end)
      else merged.push({ ...span })
    }
    return {
      ...conversation,
      spans: merged,
      durationSeconds: merged.reduce((total, span) => total + Math.floor((span.end - span.start) / 1000), 0),
    }
  }).sort((a, b) => a.spans[0].start - b.spans[0].start)
}


export type MessagePlacement = "before" | "inside" | "after" | "unknown"

/** Where a chat message falls relative to an entry's start and end, for auditing what was billed. */
export function messagePlacement(at: string | null, windowStart: number, windowEnd: number): MessagePlacement {
  const time = at ? Date.parse(at) : NaN
  if (Number.isNaN(time)) return "unknown"
  if (time < windowStart) return "before"
  if (Number.isFinite(windowEnd) && time > windowEnd) return "after"
  return "inside"
}
