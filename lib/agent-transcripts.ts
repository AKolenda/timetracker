import "server-only"
import { readFile, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

export type TranscriptMessage = { role: "user" | "assistant"; text: string; at: string | null }
export type Transcript = { source: string; conversationId: string; title: string; messages: TranscriptMessage[] }

const ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/
const MAX_MESSAGE_CHARS = 20_000

export function isTranscriptId(value: string) {
  return ID_PATTERN.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseLines(raw: string) {
  const rows: Record<string, unknown>[] = []
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line) as unknown
      if (isRecord(row)) rows.push(row)
    } catch {
      // Partial trailing lines are common while a session is still being written.
    }
  }
  return rows
}

/** Removes harness wrappers so the message reads the way the person typed it. */
function cleanText(text: string) {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<command-message>[\s\S]*?<\/command-message>\s*/g, "")
    .replace(/<command-name>([\s\S]*?)<\/command-name>\s*/g, "$1 ")
    .replace(/<command-args>([\s\S]*?)<\/command-args>/g, "$1")
    .replace(/<(app-context|environment_context|skills_instructions|recommended_plugins|multi_agent_mode|user_instructions|permissions instructions)>[\s\S]*?<\/\1>/g, "")
    .replace(/\[Attached image "[^"]*" is saved at: [^\]]*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_MESSAGE_CHARS)
}

function pushMessage(messages: TranscriptMessage[], role: "user" | "assistant", text: string, at: string | null) {
  const cleaned = cleanText(text)
  if (!cleaned || cleaned.startsWith("Base directory for this skill:")) return
  const previous = messages.at(-1)
  if (previous && previous.role === role && role === "assistant") {
    previous.text = `${previous.text}\n\n${cleaned}`.slice(0, MAX_MESSAGE_CHARS)
    return
  }
  messages.push({ role, text: cleaned, at })
}

function textBlocks(content: unknown, textTypes: string[]) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter((block): block is Record<string, unknown> => isRecord(block) && textTypes.includes(String(block.type)) && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
}

async function findFile(root: string, matches: (name: string) => boolean, depth = 4): Promise<string | null> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isFile() && matches(entry.name)) return full
  }
  if (depth <= 0) return null
  for (const entry of entries.sort((a, b) => b.name.localeCompare(a.name))) {
    if (!entry.isDirectory()) continue
    const found = await findFile(path.join(root, entry.name), matches, depth - 1)
    if (found) return found
  }
  return null
}

async function readClaude(conversationId: string): Promise<Transcript | null> {
  const file = await findFile(path.join(homedir(), ".claude", "projects"), (name) => name === `${conversationId}.jsonl`, 1)
  if (!file) return null
  const messages: TranscriptMessage[] = []
  let title = ""
  for (const row of parseLines(await readFile(file, "utf8"))) {
    if (row.type === "ai-title" && typeof row.title === "string") title = row.title
    if (row.isSidechain === true) continue
    if (row.type !== "user" && row.type !== "assistant") continue
    const message = isRecord(row.message) ? row.message : null
    if (!message) continue
    const at = typeof row.timestamp === "string" ? row.timestamp : null
    if (row.type === "user") {
      if (Array.isArray(message.content) && message.content.every((block) => isRecord(block) && block.type === "tool_result")) continue
      pushMessage(messages, "user", textBlocks(message.content, ["text"]), at)
    } else {
      pushMessage(messages, "assistant", textBlocks(message.content, ["text"]), at)
    }
  }
  return { source: "Claude", conversationId, title, messages }
}

async function readCodex(conversationId: string): Promise<Transcript | null> {
  const file = await findFile(path.join(homedir(), ".codex", "sessions"), (name) => name.endsWith(`-${conversationId}.jsonl`), 3)
  if (!file) return null
  const messages: TranscriptMessage[] = []
  for (const row of parseLines(await readFile(file, "utf8"))) {
    if (row.type !== "response_item" || !isRecord(row.payload) || row.payload.type !== "message") continue
    const role = row.payload.role
    if (role !== "user" && role !== "assistant") continue
    const at = typeof row.timestamp === "string" ? row.timestamp : null
    pushMessage(messages, role, textBlocks(row.payload.content, ["input_text", "output_text"]), at)
  }
  return { source: "Codex", conversationId, title: "", messages }
}

async function readT3Code(conversationId: string): Promise<Transcript | null> {
  const dbPath = path.join(homedir(), ".t3", "userdata", "state.sqlite")
  let db
  try {
    const { DatabaseSync } = await import("node:sqlite")
    db = new DatabaseSync(dbPath, { readOnly: true })
  } catch {
    return null
  }
  try {
    const thread = db.prepare("select title from projection_threads where thread_id = ?").get(conversationId) as { title?: string } | undefined
    const rows = db.prepare("select role, text, created_at from projection_thread_messages where thread_id = ? order by created_at, rowid").all(conversationId) as Array<{ role: string; text: string | null; created_at: string | null }>
    if (!thread && rows.length === 0) return null
    const messages: TranscriptMessage[] = []
    for (const row of rows) {
      if (row.role !== "user" && row.role !== "assistant") continue
      pushMessage(messages, row.role, row.text ?? "", row.created_at)
    }
    return { source: "T3 Code", conversationId, title: thread?.title ?? "", messages }
  } finally {
    db.close()
  }
}

/** Reads a chat from the local agent logs. Returns null when the chat is not on this machine. */
export async function readTranscript(source: string, conversationId: string): Promise<Transcript | null> {
  if (!isTranscriptId(conversationId)) return null
  if (source === "T3 Code") return readT3Code(conversationId)
  if (source === "Claude") return readClaude(conversationId)
  return readCodex(conversationId)
}
