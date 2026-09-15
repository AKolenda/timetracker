/** Converts the JSONB value stored by Supabase into safe, usable endpoint URLs. */
export function parseAgentTimeHosts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter(Boolean)
}

/** Combines the VM-wide Agent Time service with any hosts saved in Settings. */
export function agentTimeUrls(
  remoteUrl: string | undefined,
  dbHosts: string[]
): string[] {
  const environmentUrls = (remoteUrl || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)

  return [
    ...new Set([
      ...environmentUrls,
      ...parseAgentTimeHosts(dbHosts),
    ]),
  ]
}

/** User-defined labels, keyed by the configured collector URL. */
export function parseAgentTimeHostLabels(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] =>
    typeof entry[1] === "string" && entry[1].trim().length > 0
  ).map(([url, label]) => [url, label.trim()]))
}

export function machineName(source: { hostUrl?: string; machineLabel?: string }, labels: Record<string, string> = {}): string {
  if (source.hostUrl && labels[source.hostUrl]) return labels[source.hostUrl]
  if (source.machineLabel) return source.machineLabel
  try { return new URL(source.hostUrl || "").hostname } catch { return "Unknown machine" }
}

/** A chat request may select an existing collector, but cannot add an address. */
export function transcriptCollectors(host: string, remoteUrl: string | undefined, dbHosts: string[]): string[] {
  const configured = agentTimeUrls(remoteUrl, dbHosts)
  if (host && !configured.includes(host)) throw new Error("This machine is no longer configured. Add it in Settings to open its chats.")
  return host ? [host] : configured
}
