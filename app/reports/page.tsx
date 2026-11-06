import { redirect } from "next/navigation"

/** Reports live on the "Calendar & reports" page; keep the old URL (and its query) working. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item)
  }
  const qs = query.toString()
  redirect(qs ? `/calendar?${qs}` : "/calendar")
}
