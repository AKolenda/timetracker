import { subtractRanges, type TimeRange } from "./agent-time-overlap"

/** A turn that stays open this long is treated as left open, not worked, and kept out of working time. */
export const LEFT_OPEN_SECONDS = 10 * 60 * 60

export type InsightTurn = {
  folder: string
  threadKey: string
  title: string
  threadId: string
  /** Visible part of the turn, already clipped to the date range. */
  start: number
  end: number
  /** True when the whole turn, not just its visible part, ran past LEFT_OPEN_SECONDS. */
  leftOpen: boolean
  live: boolean
}

export type Billing = { kind: "project"; projectId: string } | { kind: "personal" } | { kind: "none" }

export function mergeRanges(ranges: TimeRange[]) {
  const merged: TimeRange[] = []
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (range.end <= range.start) continue
    const previous = merged.at(-1)
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else merged.push({ ...range })
  }
  return merged
}

export function rangeSeconds(ranges: TimeRange[]) {
  return mergeRanges(ranges).reduce((total, range) => total + (range.end - range.start) / 1000, 0)
}

const span = (turn: InsightTurn): TimeRange => ({ start: turn.start, end: turn.end })

/** Seconds inside `ranges` that `cover` does not reach. */
function uncoveredSeconds(ranges: TimeRange[], cover: TimeRange[]) {
  return mergeRanges(ranges)
    .flatMap((range) => subtractRanges(range, cover))
    .reduce((total, gap) => total + (gap.end - gap.start) / 1000, 0)
}

/**
 * Hours only turns left open account for: time no working turn covers. The banner, ledger, folders
 * and journal all use this, so overlapping or parallel turns count once everywhere.
 */
export function leftOpenOnlySeconds(turns: InsightTurn[], cover: InsightTurn[] = turns) {
  return uncoveredSeconds(
    turns.filter((turn) => turn.leftOpen).map(span),
    cover.filter((turn) => !turn.leftOpen).map(span)
  )
}

/** Working seconds, plus the extra seconds only covered by turns left open. */
function splitTime(turns: InsightTurn[]) {
  const working = turns.filter((turn) => !turn.leftOpen).map(span)
  return { working, workingSeconds: rangeSeconds(working), leftOpenSeconds: leftOpenOnlySeconds(turns) }
}

export type ThreadSummary = {
  key: string
  title: string
  threadId: string
  folder: string
  workingSeconds: number
  leftOpenSeconds: number
  leftOpenTurns: number
  live: boolean
  lastEnd: number
}

export function summarizeThreads(turns: InsightTurn[]): ThreadSummary[] {
  const byThread = new Map<string, InsightTurn[]>()
  for (const turn of turns) byThread.set(turn.threadKey, [...(byThread.get(turn.threadKey) ?? []), turn])
  return [...byThread].map(([key, threadTurns]) => {
    const { workingSeconds, leftOpenSeconds } = splitTime(threadTurns)
    return {
      key,
      title: threadTurns.find((turn) => turn.title)?.title ?? "",
      threadId: threadTurns[0].threadId,
      folder: threadTurns[0].folder,
      workingSeconds,
      leftOpenSeconds,
      leftOpenTurns: threadTurns.filter((turn) => turn.leftOpen).length,
      live: threadTurns.some((turn) => turn.live),
      lastEnd: Math.max(...threadTurns.map((turn) => turn.end)),
    }
  }).sort((a, b) => b.workingSeconds - a.workingSeconds || b.leftOpenSeconds - a.leftOpenSeconds)
}

export type ProjectLedger = {
  projectId: string
  workingSeconds: number
  leftOpenSeconds: number
  leftOpenTurns: number
  /** Working time a tracker entry or running timer already covers. */
  trackedSeconds: number
  /** Working time no tracker entry covers yet. */
  untrackedSeconds: number
  threads: ThreadSummary[]
}

/**
 * One row per billed project. `occupied` returns the project's tracked ranges (entries and running timers),
 * the same ranges the import flow subtracts, so "not tracked yet" matches what an import could add.
 */
export function buildProjectLedger(
  turns: InsightTurn[],
  billingFor: (folder: string) => Billing,
  occupied: (projectId: string) => TimeRange[]
): ProjectLedger[] {
  const byProject = new Map<string, InsightTurn[]>()
  for (const turn of turns) {
    const billing = billingFor(turn.folder)
    if (billing.kind !== "project") continue
    byProject.set(billing.projectId, [...(byProject.get(billing.projectId) ?? []), turn])
  }
  return [...byProject].map(([projectId, projectTurns]) => {
    const { working, workingSeconds, leftOpenSeconds } = splitTime(projectTurns)
    // Measured against working time only, so search and project filters move both columns together.
    const untrackedSeconds = uncoveredSeconds(working, occupied(projectId))
    return {
      projectId,
      workingSeconds,
      leftOpenSeconds,
      leftOpenTurns: projectTurns.filter((turn) => turn.leftOpen).length,
      trackedSeconds: Math.max(0, workingSeconds - untrackedSeconds),
      untrackedSeconds,
      threads: summarizeThreads(projectTurns),
    }
  }).sort((a, b) => b.untrackedSeconds - a.untrackedSeconds || b.workingSeconds - a.workingSeconds)
}

export type FolderSummary = {
  folder: string
  billing: Billing
  workingSeconds: number
  leftOpenSeconds: number
  leftOpenTurns: number
  threadCount: number
}

/** Folders whose time is not billed: personal ones and ones not linked to a project yet. */
export function summarizeUnbilledFolders(turns: InsightTurn[], billingFor: (folder: string) => Billing): FolderSummary[] {
  const byFolder = new Map<string, InsightTurn[]>()
  for (const turn of turns) {
    if (billingFor(turn.folder).kind === "project") continue
    byFolder.set(turn.folder, [...(byFolder.get(turn.folder) ?? []), turn])
  }
  return [...byFolder].map(([folder, folderTurns]) => {
    const { workingSeconds, leftOpenSeconds } = splitTime(folderTurns)
    return {
      folder,
      billing: billingFor(folder),
      workingSeconds,
      leftOpenSeconds,
      leftOpenTurns: folderTurns.filter((turn) => turn.leftOpen).length,
      threadCount: new Set(folderTurns.map((turn) => turn.threadKey)).size,
    }
  }).sort((a, b) => b.workingSeconds - a.workingSeconds || b.leftOpenSeconds - a.leftOpenSeconds)
}

export type JournalThread = {
  key: string
  title: string
  threadId: string
  folder: string
  workingSeconds: number
  spans: TimeRange[]
  live: boolean
}

export type JournalDay = {
  /** Local midnight that starts the day. */
  dayStart: number
  workingSeconds: number
  /** Working seconds per billing group key ("project:<id>" or "unbilled"). */
  groups: Map<string, number>
  threads: JournalThread[]
  leftOpen: { turns: number; seconds: number; spans: TimeRange[]; closedTogether: { end: number; turns: number } | null }
}

function localDayStart(time: number) {
  const day = new Date(time)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

function nextLocalDay(dayStart: number) {
  const day = new Date(dayStart)
  day.setDate(day.getDate() + 1)
  return day.getTime()
}

export function billingGroupKey(billing: Billing) {
  return billing.kind === "project" ? `project:${billing.projectId}` : "unbilled"
}

/**
 * Newest day first. Working turns are split at local midnight so each day shows its own share.
 * Left-open turns are listed on the day they started, drawn up to that day's midnight.
 */
export function buildJournal(turns: InsightTurn[], billingFor: (folder: string) => Billing): JournalDay[] {
  // Split each group's left-open-only hours across the turns that add them, earliest first, so the
  // days add up to the ledger rows and folder cards (billed time nets per project, unbilled per folder).
  const leftOpenShare = new Map<InsightTurn, number>()
  const nettingKey = (folder: string) => {
    const billing = billingFor(folder)
    return billing.kind === "project" ? `project:${billing.projectId}` : `folder:${folder}`
  }
  const byGroup = new Map<string, InsightTurn[]>()
  for (const turn of turns) byGroup.set(nettingKey(turn.folder), [...(byGroup.get(nettingKey(turn.folder)) ?? []), turn])
  for (const groupTurns of byGroup.values()) {
    let cover = mergeRanges(groupTurns.filter((turn) => !turn.leftOpen).map(span))
    for (const turn of groupTurns.filter((t) => t.leftOpen).sort((a, b) => a.start - b.start)) {
      leftOpenShare.set(turn, uncoveredSeconds([span(turn)], cover))
      cover = mergeRanges([...cover, span(turn)])
    }
  }
  const days = new Map<number, { working: { turn: InsightTurn; range: TimeRange }[]; leftOpen: InsightTurn[] }>()
  const dayFor = (dayStart: number) => {
    let day = days.get(dayStart)
    if (!day) days.set(dayStart, (day = { working: [], leftOpen: [] }))
    return day
  }
  for (const turn of turns) {
    if (turn.leftOpen) {
      dayFor(localDayStart(turn.start)).leftOpen.push(turn)
      continue
    }
    let cursor = turn.start
    while (cursor < turn.end) {
      const dayStart = localDayStart(cursor)
      const end = Math.min(turn.end, nextLocalDay(dayStart))
      dayFor(dayStart).working.push({ turn, range: { start: cursor, end } })
      cursor = end
    }
  }

  return [...days].sort(([a], [b]) => b - a).map(([dayStart, day]) => {
    const groups = new Map<string, TimeRange[]>()
    const threads = new Map<string, { turn: InsightTurn; ranges: TimeRange[]; live: boolean }>()
    for (const { turn, range } of day.working) {
      const group = billingGroupKey(billingFor(turn.folder))
      groups.set(group, [...(groups.get(group) ?? []), range])
      const thread = threads.get(turn.threadKey)
      if (thread) {
        thread.ranges.push(range)
        thread.live ||= turn.live
        if (!thread.turn.title && turn.title) thread.turn = turn
      } else threads.set(turn.threadKey, { turn, ranges: [range], live: turn.live })
    }
    const dayEnd = nextLocalDay(dayStart)
    const ends = new Map<number, number>()
    for (const turn of day.leftOpen) {
      const minute = Math.floor(turn.end / 60_000) * 60_000
      ends.set(minute, (ends.get(minute) ?? 0) + 1)
    }
    const together = [...ends].sort((a, b) => b[1] - a[1])[0]
    return {
      dayStart,
      workingSeconds: rangeSeconds(day.working.map(({ range }) => range)),
      groups: new Map([...groups].map(([key, ranges]) => [key, rangeSeconds(ranges)])),
      threads: [...threads.values()].map(({ turn, ranges, live }) => ({
        key: turn.threadKey,
        title: turn.title,
        threadId: turn.threadId,
        folder: turn.folder,
        workingSeconds: rangeSeconds(ranges),
        spans: mergeRanges(ranges),
        live,
      })).sort((a, b) => b.workingSeconds - a.workingSeconds),
      leftOpen: {
        turns: day.leftOpen.length,
        seconds: day.leftOpen.reduce((total, turn) => total + (leftOpenShare.get(turn) ?? 0), 0),
        spans: mergeRanges(day.leftOpen.map((turn) => ({ start: turn.start, end: Math.min(turn.end, dayEnd) }))),
        closedTogether: together && together[1] > 1 ? { end: together[0], turns: together[1] } : null,
      },
    }
  })
}
