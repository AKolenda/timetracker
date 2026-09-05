import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { isTranscriptId } from "@/lib/agent-transcripts"
import { summariesConfigured, summarizeConversation } from "@/lib/agent-summaries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Returns a client-facing one-line description for one agent chat. Query: source, id, title. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const source = searchParams.get("source") ?? ""
  const id = searchParams.get("id") ?? ""
  const title = (searchParams.get("title") ?? "").slice(0, 300)
  if (!isTranscriptId(id)) {
    return NextResponse.json({ error: "A chat id is required." }, { status: 400 })
  }
  if (process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" && id.startsWith("fixture-")) {
    return NextResponse.json({ title: "Mobile import review polish", source: "model", configured: true })
  }
  try {
    const result = await summarizeConversation(source, id, title)
    return NextResponse.json({ ...result, configured: summariesConfigured() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ title: null, source: "unavailable", configured: false, error: "Anthropic API key was rejected." }, { status: 200 })
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited. Try again shortly." }, { status: 429 })
    }
    const message = error instanceof Error ? error.message : "Unable to summarize the chat."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
