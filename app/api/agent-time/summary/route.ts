import { getDataProvider } from "@/lib/db"
import { titleActivityInterval } from "@/lib/interval-titles"
import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { isTranscriptId } from "@/lib/agent-transcripts"
import { availableProviders, summarizeConversation } from "@/lib/agent-summaries"

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
    return NextResponse.json({ title: "Mobile import review polish", source: "codex", configured: true })
  }
  try {
    const result = await summarizeConversation(source, id, title)
    return NextResponse.json({ ...result, configured: availableProviders().length > 0 }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited. Try again shortly." }, { status: 429 })
    }
    const message = error instanceof Error ? error.message : "Unable to summarize the chat."
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 })
  }
}


/** Titles are scoped to the exact activity interval, never the whole-chat cache. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const start = Date.parse(body.start)
    const end = Date.parse(body.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Array.isArray(body.sources) || body.sources.length > 100) {
      return NextResponse.json({ error: "Invalid activity interval." }, { status: 400 })
    }
    if (process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" && body.sources.every((s: { conversationId?: string }) => s.conversationId?.startsWith("fixture-"))) return NextResponse.json({ title: "Review interval activity", source: "codex", configured: true })
    const settings = await getDataProvider().getSettings()
    const sources = body.sources as { source: string; conversationId: string; hostUrl?: string; conversationTitle?: string }[]
    if (sources.some((s) => !isTranscriptId(s.conversationId) || typeof s.source !== "string" || (s.hostUrl !== undefined && typeof s.hostUrl !== "string"))) return NextResponse.json({ error: "Invalid chat reference." }, { status: 400 })
    const result = await titleActivityInterval(start, end, sources, settings.agentTimeHosts || [])
    return NextResponse.json({ ...result, configured: availableProviders().length > 0 }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 300) : "Unable to title this interval." }, { status: 500 })
  }
}
