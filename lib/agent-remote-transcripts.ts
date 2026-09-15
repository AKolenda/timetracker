import "server-only"
import { transcriptCollectors } from "./agent-time-hosts"

/** Only a configured collector can be queried, never a client-supplied URL. */
export async function readRemoteTranscript(source: string, id: string, host: string, dbHosts: string[], offset: number) {
  const candidates = transcriptCollectors(host, process.env.AGENT_TIME_REMOTE_URL, dbHosts)
  for (const collector of candidates) {
    const endpoint = new URL("/api/v1/transcript", collector)
    endpoint.search = new URLSearchParams({ source, id, offset: String(offset) }).toString()
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: process.env.AGENT_TIME_API_KEY ? { Authorization: `Bearer ${process.env.AGENT_TIME_API_KEY}` } : undefined })
      if (response.status === 404 && !host) continue
      if (!response.ok) throw new Error(response.status === 404 ? "Chat not found on this machine. Update its Agent Time collector if needed." : "The source machine could not return this chat.")
      const body = await response.json()
      if (!body.transcript || !Array.isArray(body.transcript.messages)) throw new Error("Update Agent Time on this machine to enable chat viewing.")
      return body.transcript
    } catch (error) {
      if (host) throw error instanceof Error && error.name !== "TimeoutError" && error.name !== "TypeError" ? error : new Error("This machine is offline or unreachable. Its saved chat details are still available.")
    }
  }
  return null
}
