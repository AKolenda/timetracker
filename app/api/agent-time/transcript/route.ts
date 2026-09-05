import { NextRequest, NextResponse } from "next/server"
import { isTranscriptId, readTranscript } from "@/lib/agent-transcripts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Returns the messages of one agent chat when its log is on this machine. Query: source, id. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const source = searchParams.get("source") ?? ""
  const id = searchParams.get("id") ?? ""
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
    const transcript = await readTranscript(source, id)
    if (!transcript) {
      return NextResponse.json({ error: "This chat is not on this device." }, { status: 404 })
    }
    return NextResponse.json({ transcript }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read the chat."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
