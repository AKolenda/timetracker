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
