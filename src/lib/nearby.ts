/**
 * "What's near this address" — counts only.
 *
 * DELIBERATELY NOT A RISK SCORE. This returns two counts and nothing else: no
 * rate, no per-capita figure, no ranking, no "safety score". A one-mile circle
 * holds a handful of records out of 976 countywide; any rate computed from it
 * would have enormous error bars and would still read to a resident as a
 * verdict on their street. Counts let someone see what is on record near them,
 * which is the honest version of that question, and the crash table and
 * project list remain the way to actually read the underlying records.
 */
import type { Project } from '../types'
import { geometryPoints } from '../data/projects'
import { METRES_PER_MILE, distanceToPathMetres, haversineMetres } from './geo'
import type { LngLat } from './geo'
import type { CrashCollection } from './useGeoData'

/**
 * Search radius, in miles.
 *
 * One mile is roughly a 20-minute walk, and it is the distance at which
 * walking to a destination is normally treated as a reasonable expectation
 * rather than an exception — it is the common "walk zone" threshold for school
 * walking eligibility. So it matches the question a resident is actually
 * asking ("what's near enough to matter to me on foot?") without being so
 * large that half the county qualifies.
 */
export const NEARBY_RADIUS_MILES = 1
const NEARBY_RADIUS_M = NEARBY_RADIUS_MILES * METRES_PER_MILE

export interface NearbyCounts {
  projects: number
  crashes: number
  /** Projects with no mapped location can't be counted for or against. */
  projectsWithoutLocation: number
}

/**
 * Counts tracked projects and recorded crashes within NEARBY_RADIUS_MILES.
 *
 * `projects` should already be filtered exactly as the map is, so the summary
 * agrees with what the visitor can actually see. Crashes are counted from the
 * same visible-crash predicate the caller supplies for the same reason.
 */
export function countNearby(
  centre: LngLat,
  projects: Project[],
  crashes: CrashCollection | null,
  crashIsVisible: (props: Record<string, unknown>) => boolean,
): NearbyCounts {
  let projectCount = 0
  let withoutLocation = 0

  for (const p of projects) {
    const pts = geometryPoints(p) as LngLat[]
    if (pts.length === 0) {
      withoutLocation++
      continue
    }
    if (distanceToPathMetres(centre, pts) <= NEARBY_RADIUS_M) projectCount++
  }

  let crashCount = 0
  for (const f of crashes?.features ?? []) {
    if (f.geometry?.type !== 'Point') continue
    const coords = f.geometry.coordinates as LngLat
    if (!crashIsVisible((f.properties ?? {}) as Record<string, unknown>)) continue
    if (haversineMetres(centre, coords) <= NEARBY_RADIUS_M) crashCount++
  }

  return { projects: projectCount, crashes: crashCount, projectsWithoutLocation: withoutLocation }
}
