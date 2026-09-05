import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { spawn } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { readTranscript } from "@/lib/agent-transcripts"

export type SummaryProvider = "codex" | "claude" | "api"
export type SummaryResult = { title: string | null; source: "cache" | SummaryProvider | "unavailable" }

const CACHE_DIR = path.join(homedir(), ".cache", "timetracker")
const CACHE_FILE = path.join(CACHE_DIR, "agent-summaries.json")
const MAX_MESSAGES = 12
const MAX_CHARS_PER_MESSAGE = 700
const CLI_TIMEOUT_MS = 90_000

// Provider order and models follow the machine's own agent logins, the same way
// T3 Code drives the Codex and Claude Code CLIs. Override with env vars.
const PROVIDER_ORDER = (process.env.AGENT_SUMMARY_PROVIDERS || "codex,claude,api")
  .split(",").map((value) => value.trim()).filter((value): value is SummaryProvider => value === "codex" || value === "claude" || value === "api")
const CODEX_MODEL = process.env.AGENT_SUMMARY_CODEX_MODEL || "gpt-5.6-luna"
const CODEX_EFFORT = process.env.AGENT_SUMMARY_CODEX_EFFORT || "low"
const CLAUDE_CLI_MODEL = process.env.AGENT_SUMMARY_CLAUDE_MODEL || "claude-sonnet-5"
const API_MODEL = process.env.AGENT_SUMMARY_API_MODEL || "claude-opus-5"

const INSTRUCTIONS = "You write one-line descriptions for time entries on a client invoice. Describe the outcome of the work in plain language a non-technical client understands. Name the feature or area worked on, not the tools, files, or code. Use 3 to 8 words in sentence case with no trailing period. Reply with the description only."

/** Runs a CLI with stdin closed; Codex otherwise waits for more input from the pipe. */
function run(command: string, args: string[]) {
  return new Promise<{ stdout: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd: tmpdir(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out`)) }, CLI_TIMEOUT_MS)
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })
    child.on("error", (error) => { clearTimeout(timer); reject(error) })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout })
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim().slice(-300)}`))
    })
  })
}
let cache: Record<string, string> | null = null
let cacheWrite: Promise<void> = Promise.resolve()
let queue: Promise<unknown> = Promise.resolve()
const unavailableProviders = new Set<SummaryProvider>()

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

function cleanTitle(text: string) {
  return text
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .at(-1)
    ?.replace(/^["'“”]+|["'“”.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) ?? ""
}

function isMissingCommand(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT"
}

async function viaCodex(excerpt: string) {
  const { stdout } = await run("codex", [
    "exec",
    "--model", CODEX_MODEL,
    "-c", `model_reasoning_effort=${JSON.stringify(CODEX_EFFORT)}`,
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-rules",
    "--color", "never",
    "-o", "-",
    `${INSTRUCTIONS} The chat follows.\n\n${excerpt}`,
  ])
  return cleanTitle(stdout)
}

async function viaClaude(excerpt: string) {
  const { stdout } = await run("claude", [
    "-p",
    "--model", CLAUDE_CLI_MODEL,
    "--output-format", "text",
    "--no-session-persistence",
    `${INSTRUCTIONS} The chat follows.\n\n${excerpt}`,
  ])
  return cleanTitle(stdout)
}

async function viaApi(excerpt: string) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw Object.assign(new Error("No Anthropic credentials"), { code: "ENOENT" })
  const client = new Anthropic()
  const response = await client.messages.create({
    model: API_MODEL,
    max_tokens: 256,
    output_config: { effort: "low" },
    system: INSTRUCTIONS,
    messages: [{ role: "user", content: excerpt }],
  })
  if (response.stop_reason === "refusal") return ""
  return cleanTitle(response.content.find((block) => block.type === "text")?.text ?? "")
}

const providers: Record<SummaryProvider, (excerpt: string) => Promise<string>> = { codex: viaCodex, claude: viaClaude, api: viaApi }

export function availableProviders() {
  return PROVIDER_ORDER.filter((provider) => !unavailableProviders.has(provider))
}

/** Writes a short client-facing description of what a chat accomplished, one chat at a time. */
export function summarizeConversation(source: string, conversationId: string, fallbackTitle: string): Promise<SummaryResult> {
  const job = queue.then(() => summarizeNow(source, conversationId, fallbackTitle))
  queue = job.catch(() => undefined)
  return job
}

async function summarizeNow(source: string, conversationId: string, fallbackTitle: string): Promise<SummaryResult> {
  const key = `${source}:${conversationId}`
  const store = await loadCache()
  if (store[key]) return { title: store[key], source: "cache" }
  if (availableProviders().length === 0) return { title: null, source: "unavailable" }

  const transcript = await readTranscript(source, conversationId)
  const messages = transcript?.messages ?? []
  if (messages.length === 0 && !fallbackTitle) return { title: null, source: "unavailable" }
  const excerpt = `Chat title: ${fallbackTitle || "(none)"}\n\n${messages
    .slice(0, MAX_MESSAGES)
    .map((message) => `${message.role === "user" ? "Client request" : "Work done"}: ${message.text.slice(0, MAX_CHARS_PER_MESSAGE)}`)
    .join("\n\n") || "(no messages available)"}`

  let lastError: unknown = null
  for (const provider of availableProviders()) {
    try {
      const title = await providers[provider](excerpt)
      if (!title) continue
      store[key] = title
      await persistCache()
      return { title, source: provider }
    } catch (error) {
      lastError = error
      if (isMissingCommand(error) || error instanceof Anthropic.AuthenticationError) unavailableProviders.add(provider)
    }
  }
  if (lastError && availableProviders().length > 0) throw lastError
  return { title: null, source: "unavailable" }
}
