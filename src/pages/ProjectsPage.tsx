/**
 * Standalone project list page (#/projects). This is also the no-map
 * fallback: everything on it works without WebGL or a network connection
 * to the tile server.
 */
import { useMemo } from 'react'
import projects from '../data/projects'
import ProjectList from '../components/ProjectList'
import type { Filters } from '../lib/urlState'
import { DEFAULT_FILTERS } from '../lib/urlState'

interface Props {
  filters: Filters
  onFiltersChange: (f: Filters) => void
}

export default function ProjectsPage({ filters, onFiltersChange }: Props) {
  const filtered = useMemo(
    () =>
      projects.filter(
        (p) => filters.districts.includes(p.district) && filters.statuses.includes(p.status),
      ),
    [filters],
  )

  return (
    <main id="main" className="doc">
      <h1>All projects</h1>
      <p className="lede">
        Every pedestrian-safety project this site tracks, sortable by how long it has been
        waiting. The <a href="#/">map view</a> shows the same list beside the map.
      </p>
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <ProjectList
          projects={filtered}
          onClearFilters={() =>
            onFiltersChange({
              ...DEFAULT_FILTERS,
              goalDismissed: filters.goalDismissed,
            })
          }
        />
      </div>
    </main>
  )
}
