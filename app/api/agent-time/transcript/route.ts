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
    return NextResponse.json({
      transcript: {
        source,
        conversationId: id,
        title: "Fixture chat",
        messages: [
          { role: "user", text: "Tighten the mobile import review so the timeline fits at 390px.", at: null },
          { role: "assistant", text: "Done. The lanes now wrap under the logos and the stats sit on one row.", at: null },
        ],
      },
    })
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
