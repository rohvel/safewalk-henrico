/**
 * Small geographic helpers shared by the address search and the
 * "what's near here" summary.
 *
 * Deliberately tiny and dependency-free: the site ships no geometry library,
 * and these three functions are all it needs.
 */

export type LngLat = [number, number]

const EARTH_RADIUS_M = 6371000

export const METRES_PER_MILE = 1609.344

/** Great-circle distance in metres between two [lng, lat] points. */
export function haversineMetres(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/**
 * Shortest distance in metres from `pt` to a path of one or more points.
 *
 * For a multi-point path this measures to the nearest point ON each segment,
 * not merely to the nearest vertex. That matters here: project geometries are
 * simplified, so a 2.9-mile line can carry only five vertices — a nearest-
 * vertex test would report an address sitting right beside the middle of such
 * a segment as nearly a mile away from it.
 */
export function distanceToPathMetres(pt: LngLat, path: LngLat[]): number {
  if (path.length === 0) return Infinity
  if (path.length === 1) return haversineMetres(pt, path[0])

  let best = Infinity
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]
    const [bx, by] = path[i]
    const dx = bx - ax
    const dy = by - ay
    const denom = dx * dx + dy * dy
    // Project pt onto the segment in degree space, then measure the real
    // distance to that projected point. Over segments this short the degree-
    // space projection is more than accurate enough to pick the right spot.
    const t =
      denom === 0 ? 0 : Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / denom))
    best = Math.min(best, haversineMetres(pt, [ax + t * dx, ay + t * dy]))
  }
  return best
}

/** Ray casting against a single closed ring. */
function pointInRing(pt: LngLat, ring: LngLat[]): boolean {
  const [x, y] = pt
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const straddles = yi > y !== yj > y
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Is `pt` inside the (Multi)Polygon carried by a GeoJSON FeatureCollection's
 * first feature? Used to check a geocoded address against the real county
 * outline — Henrico is not a rectangle, so a result can sit inside the
 * search bounding box and still be in Richmond or Chesterfield.
 *
 * Returns null when there is no usable polygon (the boundary file is loaded
 * asynchronously and is allowed to be missing), so callers can tell "outside
 * the county" apart from "cannot say yet".
 */
export function pointInBoundary(
  pt: LngLat,
  boundary: GeoJSON.FeatureCollection | null,
): boolean | null {
  const geom = boundary?.features?.[0]?.geometry
  if (!geom) return null
  const polys: LngLat[][][] =
    geom.type === 'Polygon'
      ? [geom.coordinates as LngLat[][]]
      : geom.type === 'MultiPolygon'
        ? (geom.coordinates as LngLat[][][])
        : []
  if (polys.length === 0) return null
  return polys.some(
    (rings) => pointInRing(pt, rings[0]) && !rings.slice(1).some((hole) => pointInRing(pt, hole)),
  )
}
