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

/** A project's geometry normalized to a list of points (length 1 = a point). */
export function geometryPoints(p: Project): [number, number][] {
  return Array.isArray(p.geometry[0])
    ? (p.geometry as [number, number][])
    : [p.geometry as [number, number]]
}

export function findProject(id: string): Project | undefined {
  return projects.find((p) => p.id === id)
}
