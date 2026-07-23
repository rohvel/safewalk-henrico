/**
 * Home: the map is the hero. Floating panels on desktop, a bottom sheet on
 * mobile. Also hosts the project-detail route (#/project/:slug), which
 * slides over the same map.
 *
 * Everything degrades: if WebGL is missing or the basemap can't load, the
 * map area explains itself and the list/detail UI keeps working.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import projects from '../data/projects'
import type { Project } from '../types'
import type { Filters } from '../lib/urlState'
import { DEFAULT_FILTERS, YEAR_RANGE } from '../lib/urlState'
import { useCrashData, useSchoolData } from '../lib/useGeoData'
import type { CrashProperties } from '../types'
import StatStrip from '../components/StatStrip'
import MapControls from '../components/MapControls'
import ProjectList from '../components/ProjectList'
import ProjectDetail from '../components/ProjectDetail'
import { navigate } from '../lib/router'

const MapView = lazy(() => import('../components/MapView'))

function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

type SheetState = 'peek' | 'half' | 'full'

interface Props {
  filters: Filters
  onFiltersChange: (f: Filters) => void
  selected: Project | null
}

export default function HomePage({ filters, onFiltersChange, selected }: Props) {
  const [mapFailed, setMapFailed] = useState(false)
  const [sheet, setSheet] = useState<SheetState>('peek')
  const [mobilePane, setMobilePane] = useState<'list' | 'filters'>('list')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const suppressClick = useRef(false)
  const webgl = useMemo(webglSupported, [])

  // Mount the map engine after the page has loaded and the main thread goes
  // idle. The app shell (header, goal banner, stat strip, controls) paints
  // first and owns the largest-contentful-paint; MapLibre's ~1 MB parse — the
  // single biggest cost on mobile — never blocks that initial render.
  const [mapReady, setMapReady] = useState(false)
  useEffect(() => {
    let idleId = 0
    const arm = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => setMapReady(true), { timeout: 2000 })
      } else {
        idleId = window.setTimeout(() => setMapReady(true), 300)
      }
    }
    if (document.readyState === 'complete') {
      arm()
    } else {
      window.addEventListener('load', arm, { once: true })
    }
    return () => {
      window.removeEventListener('load', arm)
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId)
      else window.clearTimeout(idleId)
    }
  }, [])

  // Opening a project on mobile expands the sheet so the detail is readable.
  useEffect(() => {
    if (selected) setSheet((s) => (s === 'peek' ? 'full' : s))
  }, [selected])

  // When the detail panel closes, move focus back onto the map controls
  // rather than letting it fall to <body> (WCAG 2.4.3 Focus Order).
  const controlsRef = useRef<HTMLElement>(null)
  const wasSelected = useRef(false)
  useEffect(() => {
    if (wasSelected.current && !selected) controlsRef.current?.focus()
    wasSelected.current = selected !== null
  }, [selected])

  /** Drag the sheet by its handle; release snaps to the nearest state. */
  function onHandlePointerDown(e: React.PointerEvent) {
    const sheetEl = sheetRef.current
    if (!sheetEl) return
    suppressClick.current = false // never carry a stale flag into a new gesture
    const startY = e.clientY
    const startH = sheetEl.getBoundingClientRect().height
    const stageH = sheetEl.parentElement?.getBoundingClientRect().height ?? window.innerHeight
    let moved = false

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onMove = (ev: PointerEvent) => {
      const h = Math.max(96, Math.min(stageH - 8, startH + (startY - ev.clientY)))
      if (Math.abs(ev.clientY - startY) > 6) moved = true
      setDragHeight(h)
    }
    const onUp = (ev: PointerEvent) => {
      cleanup()
      setDragHeight(null)
      suppressClick.current = moved // a real drag shouldn't also fire the tap-cycle
      if (!moved) return // plain tap → the button's onClick cycles states
      const h = Math.max(96, startH + (startY - ev.clientY))
      const snaps: [SheetState, number][] = [
        ['peek', 96],
        ['half', stageH * 0.48],
        ['full', stageH - 8],
      ]
      snaps.sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))
      setSheet(snaps[0][0])
    }
    // A cancelled pointer (gesture takeover, system dialog, orientation change)
    // never fires pointerup — without this the listeners leak and the sheet
    // freezes mid-drag. Restore the pre-drag height and let onClick handle taps.
    const onCancel = () => {
      cleanup()
      setDragHeight(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const crash = useCrashData()
  const schools = useSchoolData()

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (p) => filters.districts.includes(p.district) && filters.statuses.includes(p.status),
      ),
    [filters],
  )

  const visibleCrashCount = useMemo(() => {
    // Count reflects what's actually on the map — zero when the layer is off,
    // so the "crashes shown" caption never contradicts an empty crash layer.
    if (!crash.collection || !filters.layers.crashes) return 0
    return crash.collection.features.filter((f) => {
      const p = f.properties as unknown as CrashProperties
      if (p.year < filters.yearMin || p.year > filters.yearMax) return false
      const wantPed = filters.modes.includes('ped')
      const wantBike = filters.modes.includes('bike')
      if (p.mode === 'ped') return wantPed
      if (p.mode === 'bike') return wantBike
      return wantPed || wantBike // 'both'
    }).length
  }, [crash.collection, filters])

  // Include a deep-linked project on the map even if the active district/status
  // filters would exclude it — otherwise the detail panel describes a project
  // the map isn't showing, and the auto-zoom lands on an empty spot.
  const mapProjects = useMemo(() => {
    if (selected && !filteredProjects.includes(selected)) return [...filteredProjects, selected]
    return filteredProjects
  }, [filteredProjects, selected])

  const clearFilters = () =>
    onFiltersChange({
      ...DEFAULT_FILTERS,
      goalDismissed: filters.goalDismissed,
      listOpen: filters.listOpen,
    })

  const crashYears =
    filters.yearMin === YEAR_RANGE.min && filters.yearMax === YEAR_RANGE.max
      ? `${YEAR_RANGE.min}–${YEAR_RANGE.max}`
      : `${filters.yearMin}–${filters.yearMax}`

  const cycleSheet = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek')
  }

  const mapOK = webgl && !mapFailed

  return (
    <main id="main" className="map-stage">
      <h1 className="visually-hidden">
        {selected
          ? `${selected.name} — SafeWalk Henrico`
          : 'SafeWalk Henrico — map of promised pedestrian-safety projects and reported crashes in Henrico County'}
      </h1>
      {mapOK && !mapReady ? (
        <div className="map-canvas" aria-hidden="true" />
      ) : mapOK ? (
        <Suspense fallback={null}>
          <MapView
            projects={mapProjects}
            crashes={crash.collection}
            schools={filters.layers.schools ? schools : null}
            filters={filters}
            selected={selected}
            onMapFailed={() => setMapFailed(true)}
          />
        </Suspense>
      ) : (
        <div className="map-fallback">
          <div className="panel">
            <h2>The map couldn't load</h2>
            <p>
              {webgl
                ? 'The basemap did not respond. The project list still works.'
                : 'This browser has WebGL turned off, which the map needs. The project list still works.'}
            </p>
            <a className="btn" href="#/projects">
              Open the project list
            </a>
          </div>
        </div>
      )}

      {(crash.isSample || crash.failed) && (
        <div className="data-banner" role="alert">
          {crash.isSample ? (
            <>
              Showing <strong>sample crash data</strong> — not real crashes. Run{' '}
              <code>npm run fetch-crashes</code> for real VDOT data.
            </>
          ) : (
            <>
              Crash data could not be loaded. Run <code>npm run fetch-crashes</code> and redeploy.
            </>
          )}
        </div>
      )}

      {/* ---------- Desktop floating panels ---------- */}
      <StatStrip
        className="panel stat-strip--floating"
        projectCount={projects.length}
        projectsAllExample={projects.every((p) => p.placeholder)}
        crashCount={visibleCrashCount}
        crashYears={crashYears}
      />

      {selected ? (
        <div className="panel detail--floating">
          <ProjectDetail project={selected} onClose={() => navigate('/')} />
        </div>
      ) : (
        <section
          className="panel controls controls--floating"
          aria-label="Map layers and filters"
          tabIndex={-1}
          ref={controlsRef}
        >
          <MapControls filters={filters} onChange={onFiltersChange} />
        </section>
      )}

      {!selected &&
        (filters.listOpen ? (
          <section className="panel drawer" aria-label="Project list">
            <div className="sort-bar" style={{ justifyContent: 'space-between' }}>
              <strong style={{ color: 'var(--ink)' }}>Projects</strong>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => onFiltersChange({ ...filters, listOpen: false })}
              >
                Close
              </button>
            </div>
            <ProjectList projects={filteredProjects} onClearFilters={clearFilters} />
          </section>
        ) : (
          <button
            type="button"
            className="btn drawer__toggle"
            onClick={() => onFiltersChange({ ...filters, listOpen: true })}
          >
            Project list ({filteredProjects.length})
          </button>
        ))}

      {/* ---------- Mobile bottom sheet ---------- */}
      <div
        ref={sheetRef}
        className={`sheet ${sheet !== 'peek' ? `sheet--${sheet}` : ''} ${dragHeight !== null ? 'sheet--dragging' : ''}`}
        style={dragHeight !== null ? { height: dragHeight } : undefined}
      >
        <button
          type="button"
          className="sheet__handle"
          aria-label={sheet === 'full' ? 'Collapse panel' : 'Expand panel'}
          aria-expanded={sheet !== 'peek'}
          onClick={cycleSheet}
          onPointerDown={onHandlePointerDown}
        >
          <i />
        </button>
        {selected ? (
          <div className="sheet__content">
            <ProjectDetail
              project={selected}
              onClose={() => {
                navigate('/')
                setSheet('peek')
              }}
            />
          </div>
        ) : (
          <>
            <div className="sheet__header">
              <span className="sheet__summary">
                {filteredProjects.length} projects · {visibleCrashCount.toLocaleString('en-US')}{' '}
                crashes shown ({crashYears})
              </span>
              <span style={{ marginLeft: 'auto' }} />
              <button
                type="button"
                className="btn btn--small"
                aria-pressed={mobilePane === 'list'}
                onClick={() => {
                  setMobilePane('list')
                  if (sheet === 'peek') setSheet('half')
                }}
              >
                List
              </button>
              <button
                type="button"
                className="btn btn--small"
                aria-pressed={mobilePane === 'filters'}
                onClick={() => {
                  setMobilePane('filters')
                  if (sheet === 'peek') setSheet('half')
                }}
              >
                Filters
              </button>
            </div>
            {sheet !== 'peek' && (
              <div className="sheet__content">
                {mobilePane === 'list' ? (
                  <ProjectList
                    projects={filteredProjects}
                    onClearFilters={clearFilters}
                    onNavigate={() => setSheet('half')}
                  />
                ) : (
                  <div className="controls" style={{ overflowY: 'auto' }}>
                    <MapControls filters={filters} onChange={onFiltersChange} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Always-visible disclaimer on the map itself, so a visitor who never
          leaves the map still sees this isn't official county data. */}
      <p className="map-disclaimer">
        Independent student project — not official county data.{' '}
        <a href="#/about">About &amp; sources</a>
      </p>
    </main>
  )
}
