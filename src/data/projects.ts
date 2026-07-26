/**
 * Loads and lightly validates src/data/projects.json.
 *
 * JSON imports arrive as loose types (every string is just `string`), so this
 * module is the one place we assert the Project shape — and, in dev, actually
 * check it, so a typo in a hand-edited entry shows up in the console instead
 * of as a silently broken filter.
 */
import type { Project } from '../types'
import { DISTRICTS, STATUSES } from '../types'
import raw from './projects.json'

const projects = raw as unknown as Project[]

if (import.meta.env.DEV) {
  const ids = new Set<string>()
  for (const p of projects) {
    const where = `projects.json entry "${p.id}"`
    if (ids.has(p.id)) console.warn(`${where}: duplicate id`)
    ids.add(p.id)
    if (!/^[a-z0-9-]+$/.test(p.id)) console.warn(`${where}: id should be lowercase-with-hyphens`)
    if (!DISTRICTS.includes(p.district)) console.warn(`${where}: unknown district "${p.district}"`)
    if (!STATUSES.includes(p.status)) console.warn(`${where}: unknown status "${p.status}"`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateAnnounced)) console.warn(`${where}: dateAnnounced must be YYYY-MM-DD`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateStatusUpdated)) console.warn(`${where}: dateStatusUpdated must be YYYY-MM-DD`)
    if (!p.sources || p.sources.length === 0) console.warn(`${where}: every project needs at least one source`)
    if (p.placeholder !== true && p.placeholder !== false) console.warn(`${where}: placeholder must be true or false`)
  }
}

export default projects

/**
 * A project's geometry normalized to a list of points (length 1 = a point).
 * Empty when the project has no mapped location — see Project.geometry.
 */
export function geometryPoints(p: Project): [number, number][] {
  if (!p.geometry || p.geometry.length === 0) return []
  return Array.isArray(p.geometry[0])
    ? (p.geometry as [number, number][])
    : [p.geometry as [number, number]]
}

/** True when the project can be drawn on the map at all. */
export function hasLocation(p: Project): boolean {
  return geometryPoints(p).length > 0
}

export function findProject(id: string): Project | undefined {
  return projects.find((p) => p.id === id)
}

/**
 * The latest month any project entry was first publicly announced.
 *
 * Every dateAnnounced traces back to a specific county publication — almost
 * always a "Word on the Street" newsletter issue — so the newest one of
 * these IS, mechanically, the newest county publication this dataset has
 * ingested. That newsletter series ran March–September 2024 and was then
 * discontinued, so today this resolves to "2024-09-01" — but it is computed
 * from the data, not written down as a literal, so the day a future update
 * adds a project sourced from a newer publication, every "data reflects
 * publications through..." note on the site corrects itself automatically.
 */
/**
 * Does this project match a free-text query?
 *
 * Searches the fields a resident would actually type into: the project name,
 * the description (which carries the road and the cross streets — "between
 * Dominion Boulevard and Cedar Forest Road"), the status note, and the source
 * labels. Every term must appear somewhere, so adding words narrows rather
 * than widens, which is what people expect from a filter box.
 */
export function projectMatchesQuery(p: Project, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = [
    p.name,
    p.description,
    p.statusNote ?? '',
    p.district,
    ...p.sources.map((s) => s.label),
  ]
    .join(' ')
    .toLowerCase()
  return terms.every((t) => haystack.includes(t))
}

export function dataCutoffDate(): string {
  return projects.reduce((max, p) => (p.dateAnnounced > max ? p.dateAnnounced : max), '0000-00-00')
}
