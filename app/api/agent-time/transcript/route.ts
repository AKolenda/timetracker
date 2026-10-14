import { NextRequest, NextResponse } from "next/server"
import { getDataProvider } from "@/lib/db"
import { readRemoteTranscript } from "@/lib/agent-remote-transcripts"
import { isTranscriptId, readTranscript } from "@/lib/agent-transcripts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Returns the messages of one agent chat when its log is on this machine. Query: source, id. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const source = searchParams.get("source") ?? ""
  const id = searchParams.get("id") ?? ""
  const host = searchParams.get("host") ?? ""
  const offset = Number(searchParams.get("offset") || 0)
  if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: "Invalid message offset." }, { status: 400 })
  if (!isTranscriptId(id)) {
    return NextResponse.json({ error: "A chat id is required." }, { status: 400 })
  }
  if (process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" && id.startsWith("fixture-")) {
    // Timed around the mobile fixture entry (today 13:40-15:35) so the audit view shows messages on both sides of it.
    const at = (hours: number, minutes: number) => { const time = new Date(); time.setHours(hours, minutes, 0, 0); return time.toISOString() }
    const messages = [
      { role: "user", text: "Before we start: summarize where the import review stands.", at: at(13, 22) },
      { role: "assistant", text: "The review lists drafts per day; the timeline overflows at 390px.", at: at(13, 25) },
      { role: "user", text: "Tighten the mobile import review so the timeline fits at 390px.", at: at(13, 41) },
      { role: "assistant", text: `Done. The lanes now wrap under the logos and the stats sit on one row.\n\n${"Checked each lane at 390px, 768px and 1280px; no horizontal overflow remains. ".repeat(24)}`, at: at(13, 49) },
      { role: "user", text: "Now check the Claude review notes and apply the ones about spacing.", at: at(14, 3) },
      { role: "assistant", text: "Applied the spacing notes and left the colour suggestion for you to decide.", at: at(14, 11) },
      { role: "user", text: "Run the full tracker suite and report anything flaky.", at: at(14, 20) },
      { role: "assistant", text: "All tracker tests pass. One screenshot test was slow but stable across three runs.", at: at(15, 30) },
      { role: "user", text: "Thanks — tomorrow, draft the PR description.", at: at(15, 52) },
      { role: "assistant", text: "Noted. I will draft it from the commit log.", at: at(15, 53) },
    ]
    return NextResponse.json({ transcript: { source, conversationId: id, title: "Fixture chat", messages, totalMessages: messages.length, nextOffset: null } })
  }
  try {
    const settings = await getDataProvider().getSettings()
    const remote = await readRemoteTranscript(source, id, host, settings.agentTimeHosts || [], offset)
    const local = !remote && !host ? await readTranscript(source, id) : null
    const transcript = remote || (local ? { ...local, messages: local.messages.slice(offset, offset + 100), totalMessages: local.messages.length, nextOffset: offset + 100 < local.messages.length ? offset + 100 : null } : null)
    if (!transcript) {
      return NextResponse.json({ error: "This chat is not on this device." }, { status: 404 })
    }
    return NextResponse.json({ transcript }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read the chat."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
