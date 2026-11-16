import { NextRequest, NextResponse } from "next/server"
import { generateText, textProviders } from "@/lib/ai-text"
import { MAX_ENTRIES, MAX_TURNS, parseAnswer, type ChatEntry, type ChatRequest, type ChatStreamEvent, type InvoiceChatAnswer } from "@/lib/invoice-chat"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const SYSTEM = `You help a freelancer tidy an invoice before it goes to their client. You see every unbilled time entry for the client and the conversation so far. You never change anything yourself: you propose one change, and the freelancer reviews it and presses Apply.

Answer with only one JSON object, no code fence:
{"reply": string, "proposal": null | {"title": string, "group": [{"label": string, "entryIds": [id]}], "ungroup": [id], "delete": [id], "billFactor": [{"factor": number, "entryIds": [id]}], "rename": [{"entryId": id, "description": string}]}, "suggestions": [{"label": string, "prompt": string}]}

How the invoice works:
- Each entry is one invoice line unless entries in the same project share a group label; those bill as one line named by the label, with the summed time. Grouping never changes hours or the total.
- Agent Time is logged in half-hour slices of continuous work, so a long session shows up as many 30-minute entries, plus very short ones (seconds) when a chat was only opened. Grouping back-to-back slices of the same work is the usual way to cut the line count.
- billFactor is the share of an entry's time that is charged, from 0 to 1 (0.5 charges half). It lowers the total.
- delete removes entries from the time log for good. Propose it only when asked, or for entries that are clearly not billable, and say so in the reply.

Rules:
- Use only ids from the table (e1, e2…). Put each id in at most one of group, ungroup and delete.
- Labels are what the client reads: describe what was delivered in plain words, under 70 characters, with no dates, tool names, model names or chores like "start the dev server". Group only within one project.
- Unless asked otherwise, keep each group within one day so the line's date stays meaningful.
- A grouped line keeps its label until regrouped; to rename a grouped line, group the same ids under a new label.
- title: a short imperative summary of the change, such as "Group ASCEND into one line per day".
- reply: short and plain (markdown allowed). Say what the change does to the number of lines and to the total. If the message is a question, answer it and set proposal to null.
- suggestions: up to 3 likely next requests; label under 28 characters, prompt is the full message to send.`

const line = (entry: ChatEntry, id: string) => [
  id,
  entry.date,
  entry.time,
  `${Math.round(entry.duration / 60)}m`,
  entry.billFactor < 1 ? `${Math.round(entry.billFactor * 100)}%` : "100%",
  entry.projectName,
  entry.invoiceLine ? `group "${entry.invoiceLine}"` : "-",
  entry.description || "(no description)",
  entry.chats.length ? `chats: ${entry.chats.join("; ")}` : "",
].join(" | ")

function isRequest(body: unknown): body is ChatRequest {
  const value = body as ChatRequest
  return Boolean(value) && typeof value.clientName === "string" && typeof value.currency === "string" && typeof value.today === "string" &&
    Array.isArray(value.entries) && value.entries.length <= MAX_ENTRIES && Array.isArray(value.turns) && value.turns.length > 0 &&
    value.entries.every((entry) => entry && typeof entry.id === "string" && typeof entry.description === "string" && typeof entry.date === "string" && Array.isArray(entry.chats)) &&
    value.turns.every((turn) => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string")
}

function fixtureAnswer(entries: ChatEntry[], ids: Map<string, string>): InvoiceChatAnswer {
  const short = [...ids.keys()]
  return parseAnswer(JSON.stringify({
    reply: `I'd put all ${entries.length} entries on one line. The total stays the same.`,
    proposal: { title: "Group into one line", group: [{ label: "Product work", entryIds: short }] },
    suggestions: [{ label: "Charge half", prompt: "Charge half for these entries" }],
  }), ids)
}

/** Streams NDJSON events: steps as the work runs, then the answer (or an error). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!isRequest(body)) return NextResponse.json({ error: "Invalid chat request." }, { status: 400 })

  const ids = new Map(body.entries.map((entry, index) => [`e${index + 1}`, entry.id]))
  const table = body.entries.map((entry, index) => line(entry, `e${index + 1}`)).join("\n")
  const turns = body.turns.slice(-MAX_TURNS).map((turn) => ({ ...turn, text: turn.text.slice(0, 4000) }))
  const latest = turns.at(-1)!
  const history = turns.slice(0, -1).map((turn) => `${turn.role === "user" ? "Freelancer" : "You"}: ${turn.text}`).join("\n\n")
  const rates = [...new Map(body.entries.map((entry) => [entry.projectName, entry.rate])).entries()].map(([name, rate]) => `${name} at ${rate} ${body.currency}/h`).join(", ")
  const prompt = `Client: ${body.clientName}. Currency: ${body.currency}. Rates: ${rates || "none"}. Today: ${body.today}.

Unbilled entries, oldest first (id | date | local time | minutes | charged | project | group | description | chats):
${table || "(none)"}

${history ? `Conversation so far:\n${history}\n\n` : ""}Freelancer's new message: ${latest.text}`

  const fixture = process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" && body.entries.every((entry) => entry.id.startsWith("fixture-") || entry.id.startsWith("demo-"))
  if (!fixture && textProviders().length === 0) return NextResponse.json({ error: "No AI provider is set up on this server." }, { status: 503 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)) } catch { /* The browser left. */ }
      }
      send({ type: "step", step: { id: "read", label: `Read ${body.entries.length} ${body.entries.length === 1 ? "entry" : "entries"}`, status: "done", ms: 0 } })
      const started = Date.now()
      send({ type: "step", step: { id: "think", label: "Thinking", status: "running" } })
      try {
        const { answer, provider } = fixture
          ? { answer: fixtureAnswer(body.entries, ids), provider: "fixture" }
          : await generateText(SYSTEM, prompt, request.signal).then(({ text, provider }) => ({ answer: parseAnswer(text, ids), provider }))
        send({ type: "step", step: { id: "think", label: "Thought", status: "done", ms: Date.now() - started } })
        if (answer.proposal) send({ type: "step", step: { id: "draft", label: "Drafted a change", status: "done", ms: 0 } })
        send({ type: "answer", answer, provider })
      } catch (error) {
        send({ type: "step", step: { id: "think", label: "Thinking", status: "failed", ms: Date.now() - started } })
        if (!request.signal.aborted) send({ type: "error", message: error instanceof Error ? error.message.slice(0, 300) : "The AI didn't answer." })
      }
      try { controller.close() } catch { /* Already closed by the browser leaving. */ }
    },
  })
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } })
}
