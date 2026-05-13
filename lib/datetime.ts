// Parse a "YYYY-MM-DD" date string as a local-midnight Date.
// new Date("YYYY-MM-DD") parses as UTC midnight, which shifts to the previous
// day when rendered in negative-UTC timezones. Use this for display parsing.
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

// Returns YYYY-MM-DD for the given Date in the given IANA timezone.
// Empty / invalid timezone falls back to the browser's local timezone.
export function localDateString(date: Date, timezone?: string): string {
  const tz = timezone && timezone.trim() ? timezone : undefined
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    return fmt.format(date)
  } catch {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    return fmt.format(date)
  }
}

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return "UTC"
  }
}

export function listTimezones(): string[] {
  type IntlWithTzList = typeof Intl & { supportedValuesOf?: (k: string) => string[] }
  const intl = Intl as IntlWithTzList
  if (typeof intl.supportedValuesOf === "function") {
    try {
      return intl.supportedValuesOf("timeZone")
    } catch {}
  }
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Edmonton",
    "America/Toronto",
    "America/Vancouver",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
  ]
}
