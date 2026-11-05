import { Skeleton } from "@/components/ui/skeleton"

/** Shown while the store loads so the app keeps its shape instead of going blank. */
export function AppLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading TimeTracker" className="flex min-h-svh bg-sidebar">
      <div className="hidden w-64 shrink-0 flex-col gap-2 p-4 md:flex">
        <Skeleton className="mb-4 h-6 w-32 bg-sidebar-accent" />
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full bg-sidebar-accent" />
        ))}
      </div>
      <div className="m-0 flex-1 bg-background p-4 sm:p-6 md:m-2 md:ml-0 md:rounded-lg md:shadow-sm">
        <Skeleton className="mb-6 h-6 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="mt-6 h-72" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
