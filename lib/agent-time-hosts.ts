const DEFAULT_AGENT_TIME_REMOTE_URL = "http://10.40.40.10:8080/api/data"

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
  const environmentUrls = (remoteUrl || DEFAULT_AGENT_TIME_REMOTE_URL)
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
