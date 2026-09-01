import { NextRequest, NextResponse } from "next/server"
import {
  fetchAgentTime,
  parseDateBoundary,
  parseGapMinutes,
  toImportData,
} from "@/lib/agent-time"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Returns import-ready Agent Time blocks from the local desktop service.
 * Query: project, from=YYYY-MM-DD, to=YYYY-MM-DD, gapMinutes=0..1440,
 * and includeLive=true. The default gap is 15 minutes.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    if (process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" && searchParams.get("fixture") === "mobile") {
      const start = new Date()
      start.setHours(13, 40, 0, 0)
      const end = new Date()
      end.setHours(15, 35, 0, 0)
      const t3End = new Date()
      t3End.setHours(14, 12, 0, 0)
      return NextResponse.json({
        projects: ["Fixture Project"],
        intervals: [{
          id: "fixture-agent-time",
          start: start.toISOString(),
          end: end.toISOString(),
          project: "Fixture Project",
          agents: ["Codex"],
          sources: ["Codex", "T3 Code"],
          durationSeconds: 6900,
          activitySeconds: 6900,
          live: false,
          sourceIntervals: [
            { start: start.toISOString(), end: end.toISOString(), durationSeconds: 6900, agent: "Codex", source: "Codex", model: "gpt-5.6-sol", conversationId: "fixture-codex-chat", conversationTitle: "Fix the mobile Agent Time import review" },
            { start: start.toISOString(), end: t3End.toISOString(), durationSeconds: 1920, agent: "Codex", source: "T3 Code", model: "Codex", conversationId: "fixture-t3-chat", conversationTitle: "Funding tracker mobile polish" },
          ],
        }],
      })
    }
    const project = searchParams.get("project") || null
    const from = parseDateBoundary(searchParams.get("from"), "start")
    const to = parseDateBoundary(searchParams.get("to"), "end")
    const gapMinutes = parseGapMinutes(searchParams.get("gapMinutes"))
    const includeLive = searchParams.get("includeLive") === "true"

    if (from !== null && to !== null && from >= to) {
      return NextResponse.json({ error: "from must be before to." }, { status: 400 })
    }

    const data = toImportData(await fetchAgentTime(), {
      project,
      from,
      to,
      gapMinutes,
      includeLive,
    })

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach Agent Time."
    const status = message.includes("must ") || message.includes("valid date") ? 400 : 503
    return NextResponse.json({ error: message }, { status })
  }
}
