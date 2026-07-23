/**
 * The map. MapLibre GL over OpenFreeMap's Positron style (free for
 * production use, no API key; muted and light so the data layers dominate).
 *
 * Encoding rules, per the design brief:
 *  - Projects: line segments (or prominent circles for point projects),
 *    colored by status, over a thin ink casing so every status clears 3:1
 *    against the light basemap; placeholder lines draw dashed and
 *    placeholder points draw hollow — examples must look provisional.
 *  - Crashes: small dots — people walking are filled circles, people biking
 *    are rings (shape, not color, separates them); fatal crashes are larger
 *    with a dark outline. Rendered respectfully: no icons, no clustering
 *    tricks, minimal popover copy.
 *  - Schools: small neutral squares, name on click/tap.
 *
 * This component is lazy-loaded so document pages never pay for MapLibre.
 * If WebGL is unavailable the parent never mounts this — the project list
 * and detail pages work fully without a map.
 */
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MLMap,
  MapMouseEvent,
} from 'maplibre-gl'
import type { Project } from '../types'
import { geometryPoints } from '../data/projects'
import type { Filters } from '../lib/urlState'
import type { CrashCollection } from '../lib/useGeoData'
import { navigate } from '../lib/router'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

/** All of Henrico County comfortably in frame. */
const HENRICO_BOUNDS: [[number, number], [number, number]] = [
  [-77.67, 37.4],
  [-77.2, 37.72],
]

const COLORS = {
  ink: '#16181d',
  paper: '#fafbfc',
  crash: '#b3261e',
  announced: '#0072b2',
  design: '#56b4e9',
  construction: '#e69f00',
  complete: '#009e73',
}

const STATUS_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'status'],
  'announced',
  COLORS.announced,
  'design',
  COLORS.design,
  'construction',
  COLORS.construction,
  'complete',
  COLORS.complete,
  COLORS.ink,
]

/** projects.json → GeoJSON (lines for segments, points for single spots). */
function projectsToGeoJSON(projects: Project[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: projects.map((p) => {
      const pts = geometryPoints(p)
      return {
        type: 'Feature',
        geometry:
          pts.length > 1
            ? { type: 'LineString', coordinates: pts }
            : { type: 'Point', coordinates: pts[0] },
        properties: { id: p.id, status: p.status, placeholder: p.placeholder, name: p.name },
      }
    }),
  }
}

/** A small rounded-square icon for schools, drawn pixel-by-pixel. */
function schoolIcon(): { width: number; height: number; data: Uint8Array } {
  const size = 14
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y)
      const corner = Math.min(x, size - 1 - x) + Math.min(y, size - 1 - y)
      if (corner < 2) continue // clipped corners stay transparent
      if (edge < 2) {
        // white border so the square reads on any basemap color
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 255
      } else {
        // slate fill #5f6b76
        data[i] = 0x5f
        data[i + 1] = 0x6b
        data[i + 2] = 0x76
        data[i + 3] = 255
      }
    }
  }
  return { width: size, height: size, data }
}

/** Escape text before it goes into popup HTML — data is never trusted markup. */
function esc(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}

/** Neutral, factual popover copy for a crash point. */
function crashPopupHTML(props: Record<string, unknown>): string {
  const mode =
    props.mode === 'both'
      ? 'people walking and biking'
      : props.mode === 'bike'
        ? 'a person biking'
        : 'a person walking'
  const sev =
    props.sev === 'fatal'
      ? 'A person was killed.'
      : props.sev === 'injury'
        ? 'At least one person was injured.'
        : 'No injuries were recorded.'
  return (
    `<div class="sw-popup"><p class="sw-popup__kicker">Reported crash · ${esc(Number(props.year))}</p>` +
    `<p>Involving ${mode}. ${sev}</p></div>`
  )
}

/**
 * Which crash modes each layer shows, given the mode filter.
 * "both" crashes involve a walker AND a biker, so they appear as a filled
 * dot while walkers are shown, and as a ring when only bikers are shown.
 */
function modeSets(f: Filters): { ped: string[]; bike: string[] } {
  const wantPed = f.modes.includes('ped')
  const wantBike = f.modes.includes('bike')
  return {
    ped: wantPed ? ['ped', 'both'] : [],
    bike: wantBike ? (wantPed ? ['bike'] : ['bike', 'both']) : [],
  }
}

function yearAndMode(f: Filters, modes: string[]): ExpressionSpecification {
  const modeExpr: ExpressionSpecification =
    modes.length === 0
      ? ['boolean', false]
      : ['match', ['get', 'mode'], modes, true, false]
  return [
    'all',
    ['>=', ['get', 'year'], f.yearMin],
    ['<=', ['get', 'year'], f.yearMax],
    modeExpr,
  ]
}

interface Props {
  projects: Project[] // already filtered by district/status
  crashes: CrashCollection | null
  schools: GeoJSON.FeatureCollection | null
  filters: Filters
  selected: Project | null
  onMapFailed: () => void
}

export default function MapView({ projects, crashes, schools, filters, selected, onMapFailed }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const loadedRef = useRef(false)

  // Latest props, reachable from map event handlers without re-binding them.
  const stateRef = useRef({ projects, crashes, schools, filters, selected })
  stateRef.current = { projects, crashes, schools, filters, selected }

  /** Push current data + filters into the map. Safe to call repeatedly. */
  function sync(map: MLMap) {
    const { projects, crashes, schools, filters, selected } = stateRef.current

    const projSrc = map.getSource('projects') as GeoJSONSource | undefined
    if (projSrc) projSrc.setData(projectsToGeoJSON(projects))

    if (crashes && !map.getSource('crashes')) {
      map.addSource('crashes', { type: 'geojson', data: crashes as GeoJSON.FeatureCollection })
      addCrashLayers(map)
    }
    if (schools && !map.getSource('schools')) {
      map.addSource('schools', { type: 'geojson', data: schools })
      addSchoolLayer(map)
    }

    const vis = (on: boolean) => (on ? 'visible' : 'none')
    const projectLayers = [
      'project-sel-line',
      'project-sel-point',
      'project-line-casing',
      'project-lines',
      'project-lines-placeholder',
      'project-points',
      'project-points-placeholder',
    ]
    for (const id of projectLayers)
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(filters.layers.projects))
    for (const id of ['crash-fatal-halo', 'crash-ped', 'crash-bike'])
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(filters.layers.crashes))
    if (map.getLayer('schools'))
      map.setLayoutProperty('schools', 'visibility', vis(filters.layers.schools))

    const sets = modeSets(filters)
    if (map.getLayer('crash-ped')) map.setFilter('crash-ped', yearAndMode(filters, sets.ped))
    if (map.getLayer('crash-bike')) map.setFilter('crash-bike', yearAndMode(filters, sets.bike))
    if (map.getLayer('crash-fatal-halo')) {
      const anyShown = [...new Set([...sets.ped, ...sets.bike])]
      map.setFilter('crash-fatal-halo', [
        'all',
        ['==', ['get', 'sev'], 'fatal'],
        yearAndMode(filters, anyShown),
      ])
    }

    const selId = selected?.id ?? ''
    if (map.getLayer('project-sel-line')) map.setFilter('project-sel-line', ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'id'], selId]])
    if (map.getLayer('project-sel-point')) map.setFilter('project-sel-point', ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'id'], selId]])
  }

  function addProjectLayers(map: MLMap) {
    map.addSource('projects', {
      type: 'geojson',
      data: projectsToGeoJSON(stateRef.current.projects),
    })

    // ink halo under the selected project so it reads as chosen
    map.addLayer({
      id: 'project-sel-line',
      type: 'line',
      source: 'projects',
      filter: ['==', ['get', 'id'], ''],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLORS.ink, 'line-width': 12, 'line-opacity': 0.9 },
    })
    map.addLayer({
      id: 'project-sel-point',
      type: 'circle',
      source: 'projects',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': 15, 'circle-color': COLORS.ink, 'circle-opacity': 0.9 },
    })

    // A thin ink casing under EVERY project line, so design/construction
    // (light blue/orange) clear 3:1 against the pale basemap — status color
    // alone isn't enough contrast on light ground.
    map.addLayer({
      id: 'project-line-casing',
      type: 'line',
      source: 'projects',
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLORS.ink, 'line-width': 7, 'line-opacity': 0.85 },
    })

    // real projects: solid line — placeholders: dashed (dasharray can't be
    // data-driven in MapLibre, hence two layers)
    map.addLayer({
      id: 'project-lines',
      type: 'line',
      source: 'projects',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'placeholder'], true]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': STATUS_COLOR, 'line-width': 5 },
    })
    map.addLayer({
      id: 'project-lines-placeholder',
      type: 'line',
      source: 'projects',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'placeholder'], true]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': STATUS_COLOR, 'line-width': 5, 'line-dasharray': [1.8, 1.4] },
    })

    // verified points: solid status fill with an ink edge (contrast + "real")
    map.addLayer({
      id: 'project-points',
      type: 'circle',
      source: 'projects',
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'placeholder'], true]],
      paint: {
        'circle-radius': 8,
        'circle-color': STATUS_COLOR,
        'circle-stroke-color': COLORS.ink,
        'circle-stroke-width': 2,
      },
    })
    // placeholder points: hollow ring — provisional, never mistaken for real,
    // mirroring the dashed treatment of placeholder lines
    map.addLayer({
      id: 'project-points-placeholder',
      type: 'circle',
      source: 'projects',
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'placeholder'], true]],
      paint: {
        'circle-radius': 7,
        'circle-color': COLORS.paper,
        'circle-stroke-color': STATUS_COLOR,
        'circle-stroke-width': 3,
      },
    })
  }

  function addCrashLayers(map: MLMap) {
    // dark outline that marks fatal crashes, drawn under the dot itself
    map.addLayer({
      id: 'crash-fatal-halo',
      type: 'circle',
      source: 'crashes',
      filter: ['==', ['get', 'sev'], 'fatal'],
      paint: {
        'circle-radius': 8,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': COLORS.ink,
        'circle-stroke-width': 1.8,
      },
    })
    map.addLayer({
      id: 'crash-ped',
      type: 'circle',
      source: 'crashes',
      filter: ['match', ['get', 'mode'], ['ped', 'both'], true, false],
      paint: {
        'circle-radius': ['case', ['==', ['get', 'sev'], 'fatal'], 6, 4],
        'circle-color': COLORS.crash,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.2,
      },
    })
    map.addLayer({
      id: 'crash-bike',
      type: 'circle',
      source: 'crashes',
      filter: ['match', ['get', 'mode'], ['bike'], true, false],
      paint: {
        // a ring: transparent center, red stroke
        'circle-radius': ['case', ['==', ['get', 'sev'], 'fatal'], 5.5, 4],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': COLORS.crash,
        'circle-stroke-width': 2.2,
      },
    })
  }

  function addSchoolLayer(map: MLMap) {
    if (!map.hasImage('school-square')) map.addImage('school-square', schoolIcon())
    map.addLayer(
      {
        id: 'schools',
        type: 'symbol',
        source: 'schools',
        layout: { 'icon-image': 'school-square', 'icon-size': 1, 'icon-allow-overlap': true },
      },
      // schools sit beneath crash dots so they never obscure them
      map.getLayer('crash-fatal-halo') ? 'crash-fatal-halo' : undefined,
    )
  }

  // ----- map lifecycle (once) -----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let map: MLMap
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        bounds: HENRICO_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: false },
      })
    } catch {
      onMapFailed()
      return
    }
    mapRef.current = map
    if (import.meta.env.DEV) {
      // dev-only handle for debugging in the browser console
      ;(window as unknown as Record<string, unknown>).__swMap = map
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    // The canvas is keyboard-focusable and pannable. We describe it as a
    // complementary view and tell keyboard users how to inspect a feature —
    // projects are also fully reachable through the accessible project list.
    map
      .getCanvas()
      .setAttribute(
        'aria-label',
        'Map of pedestrian-safety projects and crashes in Henrico County. ' +
          'Pan with the arrow keys; press Enter to inspect the feature at the center crosshair. ' +
          'All projects are also listed in the project list.',
      )
    map.getCanvas().setAttribute('role', 'application')

    // Center crosshair: the keyboard "cursor". Hidden until the canvas is
    // focused, so it never clutters mouse use. Created imperatively so React
    // doesn't try to reconcile MapLibre's own DOM.
    const crosshair = document.createElement('div')
    crosshair.className = 'map-crosshair'
    crosshair.setAttribute('aria-hidden', 'true')
    map.getContainer().appendChild(crosshair)
    const canvas = map.getCanvas()
    canvas.addEventListener('focus', () => crosshair.classList.add('map-crosshair--on'))
    canvas.addEventListener('blur', () => crosshair.classList.remove('map-crosshair--on'))

    map.on('error', (e) => {
      // A failure before first load means no basemap at all → list fallback.
      if (!loadedRef.current && /style|fetch|network/i.test(String(e.error?.message ?? ''))) {
        onMapFailed()
      }
    })

    map.on('load', () => {
      loadedRef.current = true
      addProjectLayers(map)
      sync(map)

      const interactive = [
        'project-lines',
        'project-lines-placeholder',
        'project-points',
        'project-points-placeholder',
        'crash-ped',
        'crash-bike',
        'schools',
      ]
      for (const layer of interactive) {
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
      }

      /**
       * Act on a feature: navigate for a project, or open a popup for a
       * crash/school. `moveFocus` is set for keyboard activation so the popup
       * receives focus (screen-reader users hear it; Escape/Tab work).
       */
      const activateFeature = (
        f: maplibregl.MapGeoJSONFeature,
        lngLat: maplibregl.LngLatLike,
        moveFocus: boolean,
      ) => {
        if (f.layer.id.startsWith('project-')) {
          navigate(`/project/${f.properties.id}`)
          return
        }
        const popup = new maplibregl.Popup({
          offset: f.layer.id === 'schools' ? 10 : 8,
          closeButton: f.layer.id !== 'schools',
          focusAfterOpen: moveFocus,
        }).setLngLat(lngLat)
        popup.setHTML(
          f.layer.id === 'schools'
            ? `<div class="sw-popup"><p class="sw-popup__kicker">School</p><p>${esc(f.properties.name)}</p></div>`
            : crashPopupHTML(f.properties),
        )
        popup.addTo(map)
      }

      const present = () => interactive.filter((l) => map.getLayer(l))

      map.on('click', (e: MapMouseEvent) => {
        const f = map.queryRenderedFeatures(e.point, { layers: present() })[0]
        if (f) activateFeature(f, e.lngLat, false)
      })

      // Keyboard activation: Enter/Space inspects the feature nearest the map
      // center (marked by the crosshair that appears when the canvas is focused).
      map.getCanvas().addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return
        const rect = map.getContainer().getBoundingClientRect()
        const cx = rect.width / 2
        const cy = rect.height / 2
        // search a small box so features don't need pixel-perfect aim
        const box: [maplibregl.PointLike, maplibregl.PointLike] = [
          [cx - 16, cy - 16],
          [cx + 16, cy + 16],
        ]
        const f = map.queryRenderedFeatures(box, { layers: present() })[0]
        if (!f) return
        ev.preventDefault()
        // anchor the popup at the map center (where the crosshair sits)
        activateFeature(f, map.getCenter(), true)
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
      loadedRef.current = false
    }
    // The map is created exactly once; prop changes flow through sync().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- react to data / filter changes -----
  useEffect(() => {
    const map = mapRef.current
    if (map && loadedRef.current) sync(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, crashes, schools, filters, selected])

  // ----- auto-zoom to the selected project -----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selected) return
    const pts = geometryPoints(selected)
    const desktop = window.matchMedia('(min-width: 760px)').matches
    const padding = desktop
      ? { top: 80, left: 80, bottom: 80, right: 460 } // clear the detail panel
      : { top: 60, left: 40, right: 40, bottom: Math.round(window.innerHeight * 0.55) }
    if (pts.length === 1) {
      map.easeTo({ center: pts[0], zoom: Math.max(map.getZoom(), 14), padding, duration: 500 })
    } else {
      const bounds = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]))
      map.fitBounds(bounds, { padding, maxZoom: 15, duration: 500 })
    }
  }, [selected])

  return <div ref={containerRef} className="map-canvas" data-testid="map" />
}
