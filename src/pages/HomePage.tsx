/**
 * Home: the map is the hero. Floating panels on desktop, a bottom sheet on
 * mobile. Also hosts the project-detail route (#/project/:slug), which
 * slides over the same map.
 *
 * Everything degrades: if WebGL is missing or the basemap can't load, the
 * map area explains itself and the list/detail UI keeps working.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import projects, { dataCutoffDate, projectMatchesQuery } from '../data/projects'
import crashContext from '../data/crashContext.json'
import type { Project } from '../types'
import type { Filters } from '../lib/urlState'
import { DEFAULT_FILTERS, isYearPossiblyPartial } from '../lib/urlState'
import { useCrashData, useSchoolData, useBoundaryData } from '../lib/useGeoData'
import type { CrashProperties } from '../types'
import { formatMonthYear } from '../lib/format'
import StatStrip from '../components/StatStrip'
import type { CrashContextFigures } from '../components/StatStrip'
import MapControls from '../components/MapControls'
import MapSearch from '../components/MapSearch'
import type { SearchPlace } from '../components/MapSearch'
import ProjectList from '../components/ProjectList'
import ProjectDetail from '../components/ProjectDetail'
import { countNearby } from '../lib/nearby'
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

  // The desktop drawer/toggle dock directly below the floating stat-strip
  // panel. That panel's height isn't fixed — it grows when the crash-context
  // paragraph wraps to more lines (narrower viewport, longer numbers) — so a
  // hardcoded top offset silently drifts out of sync and the drawer ends up
  // overlapping the stat strip's own text (caught during this exact change:
  // adding the Task 4 paragraph grew the panel and did exactly that to a
  // previously-fine hardcoded 68px). Measuring the real rendered height and
  // publishing it as a CSS variable keeps the two panels correctly stacked
  // regardless of what either one's content does in the future.
  const statStripRef = useRef<HTMLDivElement>(null)
  const mapStageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const panel = statStripRef.current
    const stage = mapStageRef.current
    if (!panel || !stage || typeof ResizeObserver === 'undefined') return
    // offsetTop is relative to .map-stage (the nearest positioned ancestor,
    // `position: relative`), so top + height is the panel's true bottom edge
    // within the stage — not just its height.
    const update = () =>
      stage.style.setProperty('--stat-strip-bottom', `${panel.offsetTop + panel.offsetHeight}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(panel)
    return () => ro.disconnect()
  }, [])

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
  const boundary = useBoundaryData()

  // The text filter narrows the map as well as the list, exactly like the
  // district and status filters do. A filter that emptied the drawer while
  // leaving every marker on the map would just look broken.
  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (p) =>
          filters.districts.includes(p.district) &&
          filters.statuses.includes(p.status) &&
          projectMatchesQuery(p, filters.projectQuery),
      ),
    [filters],
  )

  /**
   * Is this crash one the map is currently drawing? Extracted so the stat
   * strip's "crashes shown" figure and the address search's "within a mile"
   * figure are answered by the same predicate — two counts on screen that
   * disagreed about what counts would be worse than either alone. False for
   * every crash when the layer is off, so neither caption can contradict an
   * empty crash layer.
   */
  const crashIsVisible = useMemo(() => {
    const wantPed = filters.modes.includes('ped')
    const wantBike = filters.modes.includes('bike')
    return (props: Record<string, unknown>): boolean => {
      if (!filters.layers.crashes) return false
      const p = props as unknown as CrashProperties
      if (p.year < filters.yearMin || p.year > filters.yearMax) return false
      if (filters.schoolZoneOnly && !p.schoolZone) return false
      if (p.mode === 'ped') return wantPed
      if (p.mode === 'bike') return wantBike
      return wantPed || wantBike // 'both'
    }
  }, [filters])

  const visibleCrashCount = useMemo(() => {
    if (!crash.collection) return 0
    return crash.collection.features.filter((f) => crashIsVisible(f.properties ?? {})).length
  }, [crash.collection, crashIsVisible])

  // Include a deep-linked project on the map even if the active district/status
  // filters would exclude it — otherwise the detail panel describes a project
  // the map isn't showing, and the auto-zoom lands on an empty spot.
  const mapProjects = useMemo(() => {
    if (selected && !filteredProjects.includes(selected)) return [...filteredProjects, selected]
    return filteredProjects
  }, [filteredProjects, selected])

  /**
   * The searched address. Held in component state and NOWHERE else — not in
   * the URL hash like every other filter, not in storage. Every other piece
   * of view state here is shareable on purpose; this one must not be, because
   * a shared link would carry where someone lives. See MapSearch.
   */
  const [searchPlace, setSearchPlace] = useState<SearchPlace | null>(null)

  const nearby = useMemo(
    () =>
      searchPlace
        ? countNearby(searchPlace.coords, filteredProjects, crash.collection, crashIsVisible)
        : null,
    [searchPlace, filteredProjects, crash.collection, crashIsVisible],
  )

  const clearFilters = () =>
    onFiltersChange({
      ...DEFAULT_FILTERS,
      goalDismissed: filters.goalDismissed,
      listOpen: filters.listOpen,
    })

  const crashYears = (() => {
    const range =
      filters.yearMin === filters.yearMax
        ? `${filters.yearMin}`
        : `${filters.yearMin}–${filters.yearMax}`
    // Task 1: 2026 (or whatever the current year is) is a partial year, not
    // an improvement — labeled everywhere it can appear, including here.
    return isYearPossiblyPartial(filters.yearMax) ? `${range}, ${filters.yearMax} partial` : range
  })()

  // Task 4's two verified figures, computed at fetch time into
  // crashContext.json (not hardcoded here) — see scripts/fetch-crashes.mjs.
  const crashContextFigures: CrashContextFigures = {
    pedBikeShare: {
      count: crashContext.pedBikeInWindow,
      total: crashContext.allCrashesTotal,
      years: `${crashContext.allCrashesYears[0]}–${crashContext.allCrashesYears.at(-1)}`,
      pct: Math.round((crashContext.pedBikeInWindow / crashContext.allCrashesTotal) * 100),
    },
    fatalShare: {
      count: crashContext.fatalPedBikeCount,
      total: crashContext.pedBikeTotal,
      years: `${crashContext.fatalPedBikeYears[0]}–${crashContext.fatalPedBikeYears[1]}`,
      pct: Math.round((crashContext.fatalPedBikeCount / crashContext.pedBikeTotal) * 100),
    },
  }

  const cycleSheet = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek')
  }

  const mapOK = webgl && !mapFailed

  return (
    /*
     * Two-row flex column: the address search, then the map stage. The search
     * sits ABOVE the map rather than floating over it on purpose — an overlay
     * would either cover data or have to dodge the stat strip, controls and
     * drawer at every breakpoint, and on a phone (where those panels give way
     * to the bottom sheet) it would eat the little map there is. Stacking
     * costs one compact row and behaves identically on every screen.
     */
    <main id="main" className="map-shell">
      <h1 className="visually-hidden">
        {selected
          ? `${selected.name} — SafeWalk Henrico`
          : 'SafeWalk Henrico — map of promised pedestrian-safety projects and reported crashes in Henrico County'}
      </h1>
      {/*
        Screen-reader testing (Narrator, and true of NVDA/JAWS browse mode too)
        found that arrow-key panning never reaches the map: the AT's own
        virtual cursor captures arrow keys before the canvas sees them. That's
        expected screen-reader behavior, not a bug in the map's handler, and
        even with panning enabled, hunting 2.5px dots isn't a good non-visual
        experience anyway. The map's crosshair+Enter model serves sighted
        keyboard-only users; #/crashes is the real accessible path to the same
        data. This link makes that handoff discoverable and immediate, first
        in tab order before the map itself.
      */}
      <a className="skip-link" href="#/crashes">
        Skip map — view crash data as a table
      </a>

      <MapSearch
        boundary={boundary}
        result={searchPlace}
        onResult={setSearchPlace}
        nearby={nearby}
      />

      <div className="map-stage" ref={mapStageRef}>
      {mapOK && !mapReady ? (
        <div className="map-canvas" aria-hidden="true" />
      ) : mapOK ? (
        <Suspense fallback={null}>
          <MapView
            projects={mapProjects}
            crashes={crash.collection}
            schools={filters.layers.schools ? schools : null}
            boundary={boundary}
            filters={filters}
            selected={selected}
            searchLocation={searchPlace?.coords ?? null}
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
        ref={statStripRef}
        className="panel stat-strip--floating"
        projectCount={projects.length}
        projectsAllExample={projects.every((p) => p.placeholder)}
        crashCount={visibleCrashCount}
        crashYears={crashYears}
        context={crashContextFigures}
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
            <ProjectList
              projects={filteredProjects}
              query={filters.projectQuery}
              onQueryChange={(q) => onFiltersChange({ ...filters, projectQuery: q })}
              onClearFilters={clearFilters}
            />
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
                    query={filters.projectQuery}
                    onQueryChange={(q) => onFiltersChange({ ...filters, projectQuery: q })}
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
          leaves the map still sees this isn't official county data — and how
          current the project statuses actually are. The cutoff month is
          derived from the data (dataCutoffDate), not hardcoded, so it can
          never silently drift out of sync with what's actually loaded. */}
      <p className="map-disclaimer">
        Independent student project — not official county data. Project statuses reflect county
        publications through {formatMonthYear(dataCutoffDate())}.{' '}
        <a href="#/about">About &amp; sources</a>
      </p>
      </div>
    </main>
  )
}
