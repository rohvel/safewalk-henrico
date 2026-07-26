/**
 * Date math and formatting helpers.
 *
 * "Days since announced" is computed here, at render time, from the ISO
 * dates in projects.json — it is never stored, so it can't go stale.
 */

/**
 * Whole days between an ISO date (YYYY-MM-DD) and today. Never negative.
 * Both endpoints are pinned to UTC midnight so the count is unaffected by
 * daylight-saving transitions (a local-time subtraction is off by one for
 * one hour a day after a spring-forward).
 */
export function daysSince(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  const then = Date.UTC(y, m - 1, d)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((today - then) / 86_400_000))
}

/** "2025-09-01" → "September 1, 2025" */
export function formatDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** "2024-09-01" → "September 2024" */
export function formatMonthYear(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
}

/** "1 day" / "412 days" */
export function pluralDays(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'day' : 'days'}`
}
