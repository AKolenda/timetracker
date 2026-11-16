import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"

export type TextProvider = "codex" | "claude" | "api"

/** Runs a CLI with stdin closed; Codex otherwise waits for more input from the pipe. */
export function run(command: string, args: string[], timeoutMs = 90_000, signal?: AbortSignal) {
  return new Promise<{ stdout: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd: tmpdir(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } })
    let stdout = ""
    let stderr = ""
    const stop = () => child.kill("SIGKILL")
    const timer = setTimeout(() => { stop(); reject(new Error(`${command} timed out`)) }, timeoutMs)
    signal?.addEventListener("abort", stop, { once: true })
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })
    child.on("error", (error) => { clearTimeout(timer); reject(error) })
    child.on("close", (code) => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", stop)
      if (code === 0) resolve({ stdout })
      else reject(new Error(signal?.aborted ? "Stopped" : `${command} exited with ${code}: ${stderr.trim().slice(-300)}`))
    })
  })
}

export function isMissingCommand(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT"
}

// The same machine logins Agent Time summaries use, in the same order. Override with env vars.
const ORDER = (process.env.INVOICE_CHAT_PROVIDERS || process.env.AGENT_SUMMARY_PROVIDERS || "codex,claude")
  .split(",").map((value) => value.trim()).filter((value): value is TextProvider => value === "codex" || value === "claude" || value === "api")
const CODEX_MODEL = process.env.INVOICE_CHAT_CODEX_MODEL || process.env.AGENT_SUMMARY_CODEX_MODEL || "gpt-5.6-terra"
const CODEX_EFFORT = process.env.INVOICE_CHAT_CODEX_EFFORT || "medium"
const CLAUDE_CLI_MODEL = process.env.INVOICE_CHAT_CLAUDE_MODEL || "claude-sonnet-5-5"
const API_MODEL = process.env.INVOICE_CHAT_API_MODEL || "claude-sonnet-5-5"
const TIMEOUT_MS = 180_000

const unavailable = new Set<TextProvider>()

async function viaCodex(system: string, prompt: string, signal?: AbortSignal) {
  const { stdout } = await run("codex", [
    "exec", "--model", CODEX_MODEL, "-c", `model_reasoning_effort=${JSON.stringify(CODEX_EFFORT)}`,
    "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--ignore-rules", "--color", "never", "-o", "-",
    `${system}\n\n${prompt}`,
  ], TIMEOUT_MS, signal)
  return stdout
}

async function viaClaude(system: string, prompt: string, signal?: AbortSignal) {
  const { stdout } = await run("claude", [
    // No tools: the chat only reads what it is given and answers in JSON.
    "-p", "--model", CLAUDE_CLI_MODEL, "--output-format", "text", "--no-session-persistence", "--tools", "",
    "--append-system-prompt", system, prompt,
  ], TIMEOUT_MS, signal)
  return stdout
}

async function viaApi(system: string, prompt: string, signal?: AbortSignal) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw Object.assign(new Error("No Anthropic credentials"), { code: "ENOENT" })
  const response = await new Anthropic().messages.create({ model: API_MODEL, max_tokens: 8000, system, messages: [{ role: "user", content: prompt }] }, { signal })
  return response.content.find((block) => block.type === "text")?.text ?? ""
}

const providers = { codex: viaCodex, claude: viaClaude, api: viaApi }

export const textProviders = () => ORDER.filter((provider) => !unavailable.has(provider))

/** The first provider that answers wins; a provider whose CLI or key is missing is skipped from then on. */
export async function generateText(system: string, prompt: string, signal?: AbortSignal): Promise<{ text: string; provider: TextProvider }> {
  let lastError: unknown = new Error("No AI provider is set up on this server.")
  for (const provider of textProviders()) {
    try {
      const text = (await providers[provider](system, prompt, signal)).trim()
      if (text) return { text, provider }
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
      if (isMissingCommand(error) || error instanceof Anthropic.AuthenticationError) unavailable.add(provider)
    }
  }
  throw lastError
}
