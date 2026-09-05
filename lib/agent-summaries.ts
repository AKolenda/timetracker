import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { readTranscript } from "@/lib/agent-transcripts"

export type SummaryResult = { title: string | null; source: "cache" | "model" | "unavailable" }

const CACHE_DIR = path.join(homedir(), ".cache", "timetracker")
const CACHE_FILE = path.join(CACHE_DIR, "agent-summaries.json")
const MAX_MESSAGES = 12
const MAX_CHARS_PER_MESSAGE = 700

let cache: Record<string, string> | null = null
let cacheWrite: Promise<void> = Promise.resolve()

async function loadCache() {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(CACHE_FILE, "utf8")) as Record<string, string>
  } catch {
    cache = {}
  }
  return cache
}

function persistCache() {
  const snapshot = JSON.stringify(cache ?? {}, null, 1)
  cacheWrite = cacheWrite.then(async () => {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(CACHE_FILE, snapshot)
  }).catch(() => {
    // A failed cache write only means the chat is summarized again next time.
  })
  return cacheWrite
}

export function summariesConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
}

function cleanTitle(text: string) {
  return text
    .split("\n")[0]
    .replace(/^["'“”]+|["'“”.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

/** Writes a short client-facing description of what a chat accomplished. */
export async function summarizeConversation(source: string, conversationId: string, fallbackTitle: string): Promise<SummaryResult> {
  const key = `${source}:${conversationId}`
  const store = await loadCache()
  if (store[key]) return { title: store[key], source: "cache" }
  if (!summariesConfigured()) return { title: null, source: "unavailable" }

  const transcript = await readTranscript(source, conversationId)
  const messages = transcript?.messages ?? []
  if (messages.length === 0 && !fallbackTitle) return { title: null, source: "unavailable" }

  const excerpt = messages
    .slice(0, MAX_MESSAGES)
    .map((message) => `${message.role === "user" ? "Client request" : "Work done"}: ${message.text.slice(0, MAX_CHARS_PER_MESSAGE)}`)
    .join("\n\n")

  const client = new Anthropic()
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 256,
    output_config: { effort: "low" },
    system: "You write one-line descriptions for time entries on a client invoice. Describe the outcome of the work in plain language a non-technical client understands. Name the feature or area worked on, not the tools, files, or code. Use 3 to 8 words in sentence case with no trailing period. Reply with the description only.",
    messages: [{
      role: "user",
      content: `Chat title: ${fallbackTitle || "(none)"}\n\n${excerpt || "(no messages available)"}`,
    }],
  })
  if (response.stop_reason === "refusal") return { title: null, source: "unavailable" }
  const text = response.content.find((block) => block.type === "text")?.text ?? ""
  const title = cleanTitle(text)
  if (!title) return { title: null, source: "unavailable" }
  store[key] = title
  await persistCache()
  return { title, source: "model" }
}
