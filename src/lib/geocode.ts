/**
 * Address lookup for the map's search box, via OpenStreetMap's Nominatim.
 *
 * NOMINATIM USAGE POLICY — what this file does about each rule:
 *
 *  - "No autocomplete / as-you-type querying." Nothing here is called on
 *    keystroke. The only caller submits a <form>, so a request happens on
 *    Enter or the Search button and at no other time.
 *  - "At most 1 request per second." Enforced globally below by delaying a
 *    request until at least MIN_REQUEST_GAP_MS after the previous one, across
 *    every caller, for the life of the page.
 *  - "Cache results, don't re-request the same thing." Identical queries are
 *    answered from an in-memory Map for the rest of the session.
 *  - "Identify your application." A browser CANNOT set User-Agent: it is a
 *    forbidden header name, so `fetch` silently drops any attempt, and code
 *    that pretended to set one would just be a lie in the source. Nominatim's
 *    policy accepts "a valid HTTP Referer OR User-Agent", and the browser
 *    sends this site's Referer automatically, which is what identifies us.
 *
 * PRIVACY: people type their home address into this. The query is sent to
 * Nominatim and nowhere else. It is never written to the URL, never persisted
 * to localStorage/sessionStorage, and the cache below dies with the tab.
 */
import henricoBounds from '../data/henricoBounds.json'
import { pointInBoundary } from './geo'
import type { LngLat } from './geo'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

/** Nominatim's stated ceiling is 1 req/sec; leave a little headroom. */
const MIN_REQUEST_GAP_MS = 1100

/** Give up on a hung request rather than leaving the UI spinning forever. */
const REQUEST_TIMEOUT_MS = 12000

export type GeocodeFailure =
  | 'no-results'
  | 'outside-county'
  | 'rate-limited'
  | 'network'
  | 'server'

export interface GeocodePlace {
  ok: true
  /** [lng, lat] */
  coords: LngLat
  /** Nominatim's own display_name, trimmed to something readable. */
  label: string
}

export interface GeocodeError {
  ok: false
  kind: GeocodeFailure
  /**
   * On-voice, tells the person what to do next. Kept here (not in the
   * component) so every failure mode is worded once and can't drift.
   */
  message: string
}

export type GeocodeResult = GeocodePlace | GeocodeError

const MESSAGES: Record<GeocodeFailure, string> = {
  'no-results':
    'No match in Henrico County. Try adding the street number, or a nearby cross street.',
  'outside-county':
    'That address is outside Henrico County, so there is nothing here to show for it. This site only tracks Henrico projects.',
  'rate-limited':
    'The OpenStreetMap geocoder is busy right now. Wait a few seconds and search again.',
  network:
    'Could not reach the OpenStreetMap geocoder. Check your connection and try again.',
  server:
    'The OpenStreetMap geocoder returned an error. Try again in a moment.',
}

const fail = (kind: GeocodeFailure): GeocodeError => ({ ok: false, kind, message: MESSAGES[kind] })

/** Session-only. Not localStorage — see the privacy note above. */
const cache = new Map<string, GeocodeResult>()

let lastRequestAt = 0
/** Serialises requests so two rapid submits can't both fire inside a second. */
let queue: Promise<unknown> = Promise.resolve()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function normalise(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * viewbox is built from the same bounds file the map's initial camera uses,
 * so the search area and the county outline can never drift apart. Nominatim
 * wants it as <minLng>,<maxLat>,<maxLng>,<minLat>.
 */
function viewbox(): string {
  const { minLng, minLat, maxLng, maxLat } = henricoBounds
  return `${minLng},${maxLat},${maxLng},${minLat}`
}

/** Shorten Nominatim's very long display_name to its first few parts. */
function shortLabel(displayName: string): string {
  const parts = displayName.split(',').map((s) => s.trim())
    // Drop the trailing country/postcode noise; keep the locally meaningful head.
    .filter(Boolean)
  return parts.slice(0, 3).join(', ')
}

async function requestNominatim(query: string): Promise<GeocodeResult> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '0',
    countrycodes: 'us',
    viewbox: viewbox(),
    // Hard-restrict to the viewbox. Without this Nominatim treats the box as
    // a preference and will happily answer with a Monument Avenue in another
    // state, which is precisely the "flying somewhere irrelevant" case.
    bounded: '1',
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${NOMINATIM_URL}?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
  } catch {
    return fail('network')
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 429) return fail('rate-limited')
  if (!res.ok) return fail('server')

  let json: unknown
  try {
    json = await res.json()
  } catch {
    return fail('server')
  }
  if (!Array.isArray(json) || json.length === 0) return fail('no-results')

  const hit = json[0] as { lat?: string; lon?: string; display_name?: string }
  const lat = Number(hit.lat)
  const lng = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail('no-results')

  return {
    ok: true,
    coords: [lng, lat],
    label: shortLabel(hit.display_name ?? query),
  }
}

/**
 * Geocode `query`, restricted to Henrico.
 *
 * `boundary` is the county outline (loaded asynchronously by the map). When
 * it is available the result is additionally tested against the real polygon,
 * because the viewbox is a rectangle and Henrico is not: an address in
 * Richmond or Chesterfield can sit inside the box and still not be in the
 * county. When the boundary hasn't loaded, the rectangle is all we can check
 * and the result is accepted — better than refusing to search at all.
 */
export async function geocodeInHenrico(
  query: string,
  boundary: GeoJSON.FeatureCollection | null,
): Promise<GeocodeResult> {
  const key = normalise(query)
  if (!key) return fail('no-results')

  const cached = cache.get(key)
  if (cached) {
    // Re-check containment on a cache hit: the first lookup may have happened
    // before the boundary finished loading.
    if (cached.ok && pointInBoundary(cached.coords, boundary) === false) {
      return fail('outside-county')
    }
    return cached
  }

  // Chain onto the queue so concurrent submits are spaced, not simultaneous.
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    return requestNominatim(key)
  })
  queue = run.catch(() => undefined)

  const result = await run

  // Only cache outcomes that are properties of the QUERY, not of the moment.
  // Caching a rate-limit or a dropped connection would make a transient
  // failure permanent for the rest of the session.
  if (result.ok || result.kind === 'no-results') cache.set(key, result)

  if (result.ok && pointInBoundary(result.coords, boundary) === false) {
    return fail('outside-county')
  }
  return result
}
