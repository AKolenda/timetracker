import { after, NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { rowToTimeEntry } from "@/lib/db/supabase-provider"
import { getDataProvider } from "@/lib/db"
import { groupConversationSources } from "@/lib/agent-time-chats"
import { titleActivityInterval } from "@/lib/interval-titles"
import type { TimeEntry } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const running = new Set<string>()
const fixtureStarted = new Map<string, number>()

async function finish(entry: TimeEntry, title: string | null, failed: boolean) {
  const { error } = await supabase.rpc("finish_agent_time_title", {
    entry_id: entry.id, expected_description: entry.description,
    expected_start: entry.startTime, expected_end: entry.endTime,
    expected_sources: entry.agentTimeSources || [], new_title: title, failed,
  })
  if (error) throw error
}

async function nameEntry(entry: TimeEntry, hosts: string[]) {
  try {
    if (!entry.endTime) { await finish(entry, null, true); return }
    const start = Date.parse(entry.startTime), end = Date.parse(entry.endTime)
    const sources = groupConversationSources(entry.agentTimeSources || [], start, end).filter((source) => source.conversationId)
    const result = await titleActivityInterval(start, end, sources, hosts)
    if ("pending" in result && result.pending) return
    await finish(entry, result.title, false)
  } catch {
    await finish(entry, null, true).catch(() => undefined)
  } finally { running.delete(entry.id) }
}

/** Respond immediately; pending rows are the durable queue and can resume after a restart. */
export async function POST(request: NextRequest) {
  try {
    const { ids } = await request.json() as { ids?: unknown }
    if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== "string" || id.length > 128)) return NextResponse.json({ error: "Invalid entry IDs." }, { status: 400 })
    if (process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" && ids.every((id) => id.startsWith("fixture-"))) {
      return NextResponse.json({ entries: ids.flatMap((id) => {
        if (!fixtureStarted.has(id)) fixtureStarted.set(id, Date.now())
        return Date.now() - fixtureStarted.get(id)! < 1500 ? [] : [{ id, description: "Refine mobile import review", agentTimeTitleStatus: null }]
      }) })
    }
    const { data, error } = await supabase.from("time_entries").select("*").in("id", ids)
    if (error) throw error
    const entries = (data || []).map(rowToTimeEntry)
    const pending = entries.filter((entry) => entry.agentTimeTitleStatus === "pending" && !running.has(entry.id))
    for (const entry of pending) running.add(entry.id)
    if (pending.length) after(async () => {
      try {
        const settings = await getDataProvider().getSettings()
        await Promise.all(pending.map((entry) => nameEntry(entry, settings.agentTimeHosts || [])))
      } finally { for (const entry of pending) running.delete(entry.id) }
    })
    return NextResponse.json({ entries: entries.map(({ id, description, agentTimeTitleStatus }) => ({ id, description, agentTimeTitleStatus })) }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Could not check naming progress." }, { status: 500 })
  }
}
