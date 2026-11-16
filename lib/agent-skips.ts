// Skipped Agent Time: ranges the import never drafts again. They live in this browser only.

export type IgnoredAgentRange = {
  id: string
  agentProject: string
  start: number
  end: number
}

export const IGNORED_AGENT_RANGES_KEY = "timetracker-agent-time-ignored-ranges"

export function mobileFixtureRequested() {
  return typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" &&
    new URLSearchParams(window.location.search).get("fixture") === "mobile"
}

/** Fixture sessions keep their own preferences so tests never touch real ones. */
export function agentPreferenceStorageKey(key: string) {
  if (!mobileFixtureRequested()) return key
  const fixtureSession = new URLSearchParams(window.location.search).get("fixtureSession") || "default"
  return `${key}:fixture:${fixtureSession}`
}

export function savedIgnoredAgentRanges() {
  if (typeof window === "undefined") return []
  try {
    const saved = JSON.parse(localStorage.getItem(agentPreferenceStorageKey(IGNORED_AGENT_RANGES_KEY)) ?? "[]") as unknown
    if (!Array.isArray(saved)) return []
    return saved.filter((range): range is IgnoredAgentRange => {
      if (!range || typeof range !== "object") return false
      const candidate = range as Partial<IgnoredAgentRange>
      return typeof candidate.id === "string" &&
        typeof candidate.agentProject === "string" &&
        typeof candidate.start === "number" &&
        Number.isFinite(candidate.start) &&
        typeof candidate.end === "number" &&
        Number.isFinite(candidate.end) &&
        candidate.end > candidate.start
    })
  } catch {
    return []
  }
}

export function persistIgnoredAgentRanges(ranges: IgnoredAgentRange[]) {
  try {
    localStorage.setItem(agentPreferenceStorageKey(IGNORED_AGENT_RANGES_KEY), JSON.stringify(ranges))
  } catch {
    // Ignoring still applies until this page is refreshed.
  }
}

type SkippableEntry = { projectId: string; startTime: string; endTime: string | null; agentTimeSources?: unknown[] }

/**
 * Skips the Agent Time behind entries being deleted, so the import does not draft it again.
 * A skip names one of the project's linked folders; entries in a project with none cannot be
 * skipped this way. Returns the ids it added, for undo.
 */
export function skipEntryAgentTime(entries: SkippableEntry[], projects: { id: string; agentFolders?: string[] }[]): string[] {
  const folders = new Map(projects.map((project) => [project.id, project.agentFolders?.[0]]))
  const ranges: IgnoredAgentRange[] = []
  for (const entry of entries) {
    const agentProject = folders.get(entry.projectId)
    const start = Date.parse(entry.startTime)
    const end = entry.endTime ? Date.parse(entry.endTime) : NaN
    if (!agentProject || !entry.agentTimeSources?.length || !(end > start)) continue
    ranges.push({ id: `${agentProject}:${start}:${end}`, agentProject, start, end })
  }
  const current = savedIgnoredAgentRanges()
  const added = ranges.filter((range) => !current.some((existing) => existing.id === range.id))
  if (added.length) persistIgnoredAgentRanges([...current, ...added])
  return added.map((range) => range.id)
}

export function unskipAgentRanges(ids: string[]) {
  if (!ids.length) return
  const drop = new Set(ids)
  persistIgnoredAgentRanges(savedIgnoredAgentRanges().filter((range) => !drop.has(range.id)))
}
