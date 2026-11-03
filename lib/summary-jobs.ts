/** Share concurrent work and briefly retain failures/empty results to prevent retry storms. */
export function createSummaryJobs<T>(cooldownMs = 60_000) {
  const jobs = new Map<string, { promise: Promise<T>; expires: number }>()
  return (key: string, work: () => Promise<T>): Promise<T> => {
    const previous = jobs.get(key)
    if (previous && previous.expires > Date.now()) return previous.promise
    const job = { promise: Promise.resolve().then(work), expires: Infinity }
    jobs.set(key, job)
    const settle = () => { job.expires = Date.now() + cooldownMs }
    void job.promise.then(settle, settle)
    // Remove old keys opportunistically without retaining timers across requests.
    for (const [id, value] of jobs) if (value.expires <= Date.now()) jobs.delete(id)
    return job.promise
  }
}

/** A growing interval has no final title yet. Full older intervals can still be titled. */
export function intervalIsSettled(end: number, now = Date.now()) {
  return end <= now - 120_000
}

/**
 * Shares one read of a growing record (a chat still being written) among callers who only
 * need it up to a time before that read began. Later callers get a fresh read.
 */
export function createSnapshotReads<T>(keepMs = 5 * 60_000, failedKeepMs = 15_000, now = () => Date.now()) {
  const reads = new Map<string, { startedAt: number; expires: number; value: Promise<T> }>()
  return (key: string, until: number, read: () => Promise<T>): Promise<T> => {
    const time = now()
    for (const [id, entry] of reads) if (entry.expires <= time) reads.delete(id)
    const cached = reads.get(key)
    if (cached && cached.startedAt >= until) return cached.value
    const entry = { startedAt: time, expires: Infinity, value: Promise.resolve().then(read) }
    reads.set(key, entry)
    entry.value.then(
      () => { entry.expires = now() + keepMs },
      () => { entry.expires = now() + failedKeepMs },
    )
    return entry.value
  }
}
