/**
 * The sortable project list. Rendered three places: the desktop drawer,
 * the mobile bottom sheet, and the standalone #/projects page (which is the
 * no-map fallback, so this component never assumes a map exists).
 */
import { useState } from 'react'
import type { Project } from '../types'
import { STATUSES, TYPE_LABEL } from '../types'
import { daysSince, formatMonthYear } from '../lib/format'
import { hasLocation } from '../data/projects'
import { buildHash, currentLocation } from '../lib/router'
import CrosswalkStepper from './CrosswalkStepper'
import ExampleBadge from './ExampleBadge'

type SortKey = 'days' | 'district' | 'status'

interface Props {
  projects: Project[]
  /** Called with no arguments when a project is chosen (e.g. to close a sheet). */
  onNavigate?: () => void
  onClearFilters?: () => void
}

export default function ProjectList({ projects, onNavigate, onClearFilters }: Props) {
  const [sort, setSort] = useState<SortKey>('days')

  const sorted = [...projects].sort((a, b) => {
    if (sort === 'days') return daysSince(b.dateAnnounced) - daysSince(a.dateAnnounced)
    if (sort === 'district') return a.district.localeCompare(b.district) || a.name.localeCompare(b.name)
    return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.name.localeCompare(b.name)
  })

  const params = currentLocation().params

  return (
    <>
      <div className="sort-bar">
        <label htmlFor="project-sort">Sort by</label>
        <select
          id="project-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="days">Days since announced</option>
          <option value="district">District</option>
          <option value="status">Status</option>
        </select>
        <span className="spacer" style={{ marginLeft: 'auto' }}>
          {sorted.length} {sorted.length === 1 ? 'project' : 'projects'}
        </span>
      </div>
      {sorted.length === 0 ? (
        <div className="list-empty">
          <p>No projects match these filters.</p>
          {onClearFilters && (
            <button type="button" className="btn btn--small" onClick={onClearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="project-list">
          {sorted.map((p) => {
            const days = daysSince(p.dateAnnounced)
            return (
              <li key={p.id}>
                <a
                  className="list-row"
                  href={buildHash(`/project/${p.id}`, params)}
                  onClick={() => onNavigate?.()}
                >
                  <span className="list-row__top">
                    <span className="list-row__name">{p.name}</span>
                    <span className="list-row__days">
                      <span className="num">{days.toLocaleString('en-US')}</span>
                      <small>days since announced</small>
                    </span>
                  </span>
                  <span className="list-row__meta">
                    <CrosswalkStepper status={p.status} mini />
                    <span>
                      {p.district} · {TYPE_LABEL[p.type]}
                    </span>
                    <span
                      className="list-row__asof"
                      title="This status was last confirmed as of this date — the county may have updated it since"
                    >
                      as of {formatMonthYear(p.dateStatusUpdated)}
                    </span>
                    {!hasLocation(p) && (
                      <span className="chip chip--quiet" title="No mapped location">
                        Not on map
                      </span>
                    )}
                    {p.placeholder && <ExampleBadge />}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
