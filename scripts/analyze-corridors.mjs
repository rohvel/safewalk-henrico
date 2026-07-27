/**
 * analyze-corridors.mjs
 * ---------------------
 * Cross-references two datasets this site already holds: where pedestrian and
 * cyclist crashes were recorded, and where tracked projects are.
 *
 * Run it with:   npm run analyze-corridors
 * Writes:        src/data/corridors.json
 *
 * ============================ WHAT THIS IS NOT ============================
 * This does NOT measure danger, risk, or neglect, and nothing downstream may
 * present it as if it did.
 *
 * A crash count is not a risk rate. Risk needs exposure — how many people
 * actually walk a corridor — and no such data exists for Henrico. A busy
 * commercial arterial will record more crashes than a quiet street largely
 * because more people are walking on it. So the output is ordered by
 * RECORDED CRASH COUNT and labelled exactly that.
 *
 * Nor does "no tracked project" mean "the county did nothing here". This
 * site's project data is a few dozen entries read out of six 2024
 * newsletters — a fraction of the county's real programme. A segment with no
 * match may well have a project this site has never heard of.
 *
 * =============================== METHOD ==================================
 * Chosen after testing both candidate approaches against the real data.
 *
 * 1. CORRIDOR. Crashes carry VDOT's own route name (`loc`, decoded by
 *    fetch-crashes.mjs). 960 of 976 records have one — 98.4% — so grouping by
 *    it discards very little. Travel-direction SUFFIXES are merged
 *    ("US 250 EB" + "US 250 WB" -> "US 250"): those are two directions of one
 *    physical road, and 43% of named records carry one. Directional
 *    PREFIXES are NOT merged ("E Laburnum Ave" vs "S Laburnum Ave"), because
 *    those are genuinely different stretches of road, not two sides of the
 *    same one.
 *
 * 2. SEGMENT. Grouping by name alone is not usable: "US 250" spans 9.2 miles
 *    of Henrico, from city-line urban arterial to Short Pump highway. A single
 *    "has a project?" answer for nine miles of road is meaningless. So each
 *    corridor is cut into segments wherever there is a gap of more than
 *    SEGMENT_GAP_M between neighbouring crashes ON THAT ROAD. The road
 *    supplies the axis, so a break means "these crashes are contiguous along
 *    this road; those are a separate stretch" — a data-driven cut, not an
 *    arbitrary grid.
 *
 *    SEGMENT_GAP_M = 300 was chosen by sweeping 200-800 m. Up to 300 m the
 *    median published segment stays about 0.6 mi — a stretch a person can
 *    picture. At 500 m and beyond single-link chaining starts welding
 *    distinct stretches together and the median jumps past a mile.
 *
 * 3. MATCH. A tracked project counts as "on" a segment when any part of its
 *    geometry lies within MATCH_RADIUS_M of at least one crash in that
 *    segment. 100 m is roughly a city block — about the distance within which
 *    a crossing, signal or stretch of sidewalk plausibly bears on the spot a
 *    crash was recorded. The exact distance to the nearest project is emitted
 *    alongside the yes/no, so a reader can apply their own threshold instead
 *    of taking this one on faith.
 *
 *    Nine of thirty projects have no mapped location at all and therefore
 *    cannot match anything. That is carried through to the output so the
 *    page can say so.
 *
 * 4. NAME. VDOT route codes are not how anyone refers to a road, and a code
 *    maps to different street names along its length (US 60 is Midlothian
 *    Turnpike in Chesterfield but Williamsburg Road in Henrico). So the
 *    street name is resolved PER SEGMENT from OpenStreetMap: ways near the
 *    segment's midpoint, preferring one whose `ref` matches the route code.
 *    Cached to data-raw/, rate-limited, and every lookup records how it was
 *    resolved so a wrong label can be traced.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'

const CRASHES = new URL('../public/data/crashes.geojson', import.meta.url)
const PROJECTS = new URL('../src/data/projects.json', import.meta.url)
const OUT = new URL('../src/data/corridors.json', import.meta.url)
const NAME_CACHE = new URL('../data-raw/corridor-names-cache.json', import.meta.url)

const OVERPASS = 'https://overpass-api.de/api/interpreter'
const UA = 'SafeWalkHenrico/1.0 (civic transparency project; safewalkhenrico@gmail.com)'

/** Break a corridor into segments at gaps wider than this. See header. */
const SEGMENT_GAP_M = 300
/** A project within this distance of a crash counts as "on" its segment. */
const MATCH_RADIUS_M = 100
/**
 * Minimum crashes for a segment to be published. Below this the count is too
 * small to order meaningfully against its neighbours, and a table of
 * one-crash rows would be noise pretending to be a finding.
 */
const MIN_CRASHES = 5

const OVERPASS_DELAY_MS = 2500
const OVERPASS_RETRIES = 4

// ------------------------------------------------------------------ geometry

const R = 6371000
const toRad = (d) => (d * Math.PI) / 180

function haversine(a, b) {
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a[1])) * Math.cos(toRad(b[1]))
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Shortest distance from a point to a path of one or more points. */
function distanceToPath(pt, path) {
  if (path.length === 1) return haversine(pt, path[0])
  let best = Infinity
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]
    const [bx, by] = path[i]
    const dx = bx - ax
    const dy = by - ay
    const den = dx * dx + dy * dy
    const t = den === 0 ? 0 : Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / den))
    best = Math.min(best, haversine(pt, [ax + t * dx, ay + t * dy]))
  }
  return best
}

// ------------------------------------------------------------------- caching

let nameCache = {}
async function loadCache() {
  try {
    nameCache = JSON.parse(await readFile(NAME_CACHE, 'utf8'))
  } catch {
    nameCache = {}
  }
}
async function saveCache() {
  await mkdir(new URL('../data-raw/', import.meta.url), { recursive: true })
  await writeFile(NAME_CACHE, JSON.stringify(nameCache, null, 2) + '\n')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function overpass(query) {
  for (let attempt = 1; attempt <= OVERPASS_RETRIES; attempt++) {
    await sleep(OVERPASS_DELAY_MS * attempt)
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'text/plain' },
      body: query,
    })
    if (res.ok) return await res.json()
    if (res.status !== 429 && res.status !== 504) throw new Error(`Overpass HTTP ${res.status}`)
    process.stdout.write(`  (Overpass ${res.status}, retry ${attempt})\n`)
  }
  return null
}

/**
 * VDOT writes state routes "SR 33"; OpenStreetMap writes them "VA 33". Try
 * both, plus the raw code, so a match is found whichever convention applies.
 */
function refCandidates(corridor) {
  const m = corridor.match(/^(US|SR|VA|I)\s*(\d+)$/)
  if (!m) return []
  const [, kind, num] = m
  if (kind === 'SR' || kind === 'VA') return [`VA ${num}`, `SR ${num}`]
  if (kind === 'I') return [`I ${num}`, `I-${num}`]
  return [`US ${num}`]
}

/**
 * Resolve a human street name for one segment, from OSM.
 *
 * Only route CODES need this. When VDOT already gives a street name
 * ("Glenside Dr", "Quioccasin Rd") there is nothing to improve on, and
 * querying anyway would burn a rate-limited request to compare "E Laburnum
 * Ave" against OSM's "East Laburnum Avenue" and call the mismatch a failure.
 */
async function resolveName(corridor, centre) {
  if (refCandidates(corridor).length === 0) {
    return { name: null, via: 'already-a-street-name' }
  }

  const key = `${corridor}@${centre[0].toFixed(5)},${centre[1].toFixed(5)}`
  if (key in nameCache) return nameCache[key]

  const q = `[out:json][timeout:60];
way(around:160,${centre[1]},${centre[0]})["highway"]["name"];
out tags;`
  let json = null
  try {
    json = await overpass(q)
  } catch {
    json = null
  }

  let result = { name: null, via: 'unresolved' }
  if (json?.elements?.length) {
    const wanted = refCandidates(corridor)
    const byRef = new Map()
    const byName = new Map()
    for (const el of json.elements) {
      const t = el.tags ?? {}
      if (!t.name) continue
      const refs = String(t.ref ?? '')
        .split(';')
        .map((s) => s.trim())
      byName.set(t.name, (byName.get(t.name) ?? 0) + 1)
      if (wanted.some((w) => refs.includes(w))) {
        byRef.set(t.name, (byRef.get(t.name) ?? 0) + 1)
      }
    }
    const pick = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    result = byRef.size
      ? { name: pick(byRef), via: 'ref-match' }
      : { name: null, via: 'no-ref-match' }
  }

  // Never cache a transient failure: Overpass rate-limits hard, and caching a
  // 429 would make one busy afternoon permanent. A genuine "no way here
  // carries this route code" IS cached, since re-asking will not change it.
  if (result.via !== 'unresolved') {
    nameCache[key] = result
    await saveCache()
  }
  return result
}

// ---------------------------------------------------------------------- main

/** Merge travel-direction suffixes; keep directional prefixes. */
const stripDirection = (loc) => loc.replace(/\s+(EB|WB|NB|SB)$/, '').trim()

/** Single-link clustering: two crashes join if within `gap` metres. */
function clusterByGap(points, gap) {
  const parent = points.map((_, i) => i)
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (haversine(points[i], points[j]) <= gap) {
        const a = find(i)
        const b = find(j)
        if (a !== b) parent[b] = a
      }
    }
  }
  const groups = new Map()
  for (let i = 0; i < points.length; i++) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(i)
  }
  return [...groups.values()]
}

async function main() {
  const crashes = JSON.parse(await readFile(CRASHES, 'utf8')).features
  const projects = JSON.parse(await readFile(PROJECTS, 'utf8'))
  await loadCache()

  const placed = []
  let unplaced = 0
  for (const f of crashes) {
    const loc = f.properties?.loc ?? ''
    if (!loc) {
      unplaced++
      continue
    }
    placed.push({ corridor: stripDirection(loc), coord: f.geometry.coordinates, p: f.properties })
  }

  const geolocated = projects
    .filter((p) => p.geometry)
    .map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      path: Array.isArray(p.geometry[0]) ? p.geometry : [p.geometry],
    }))
  const withoutLocation = projects.length - geolocated.length

  // Group -> segment
  const byCorridor = new Map()
  for (const c of placed) {
    if (!byCorridor.has(c.corridor)) byCorridor.set(c.corridor, [])
    byCorridor.get(c.corridor).push(c)
  }

  const segments = []
  for (const [corridor, members] of byCorridor) {
    const pts = members.map((m) => m.coord)
    for (const idxs of clusterByGap(pts, SEGMENT_GAP_M)) {
      const group = idxs.map((i) => members[i])
      const coords = group.map((g) => g.coord)
      const fatal = group.filter((g) => g.p.sev === 'fatal').length
      let spread = 0
      for (const a of coords) for (const b of coords) spread = Math.max(spread, haversine(a, b))
      const centre = [
        coords.reduce((s, c) => s + c[0], 0) / coords.length,
        coords.reduce((s, c) => s + c[1], 0) / coords.length,
      ]
      const years = group.map((g) => g.p.year)

      // Project matching
      const matches = []
      let nearest = { id: null, name: null, metres: Infinity }
      for (const proj of geolocated) {
        let d = Infinity
        for (const c of coords) d = Math.min(d, distanceToPath(c, proj.path))
        if (d < nearest.metres) nearest = { id: proj.id, name: proj.name, metres: d }
        if (d <= MATCH_RADIUS_M) matches.push({ id: proj.id, name: proj.name, metres: Math.round(d) })
      }
      matches.sort((a, b) => a.metres - b.metres)

      segments.push({
        corridor,
        crashes: group.length,
        fatal,
        spreadMetres: Math.round(spread),
        centre: [Number(centre[0].toFixed(5)), Number(centre[1].toFixed(5))],
        bbox: [
          Math.min(...coords.map((c) => c[0])),
          Math.min(...coords.map((c) => c[1])),
          Math.max(...coords.map((c) => c[0])),
          Math.max(...coords.map((c) => c[1])),
        ].map((n) => Number(n.toFixed(5))),
        yearMin: Math.min(...years),
        yearMax: Math.max(...years),
        matchedProjects: matches,
        nearestProjectId: nearest.id,
        nearestProjectName: nearest.name,
        nearestProjectMetres: Number.isFinite(nearest.metres) ? Math.round(nearest.metres) : null,
      })
    }
  }

  segments.sort((a, b) => b.crashes - a.crashes || b.fatal - a.fatal)
  const published = segments.filter((s) => s.crashes >= MIN_CRASHES)

  console.log(`Crashes: ${crashes.length} total, ${placed.length} with a road name, ${unplaced} without.`)
  console.log(`Segments: ${segments.length} total, ${published.length} with >= ${MIN_CRASHES} crashes.`)
  console.log(`Resolving street names for ${published.length} segments (cached where possible)...`)

  for (const s of published) {
    const r = await resolveName(s.corridor, s.centre)
    s.streetName = r.name
    s.nameSource = r.via
    console.log(
      `  ${String(s.crashes).padStart(3)} crashes  ${s.corridor.padEnd(16)} -> ${r.name ?? '(unresolved)'} [${r.via}]`,
    )
  }

  const publishedCrashes = published.reduce((n, s) => n + s.crashes, 0)
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    method: {
      segmentGapMetres: SEGMENT_GAP_M,
      matchRadiusMetres: MATCH_RADIUS_M,
      minCrashes: MIN_CRASHES,
    },
    totals: {
      crashes: crashes.length,
      crashesWithRoadName: placed.length,
      crashesWithoutRoadName: unplaced,
      segmentsAll: segments.length,
      segmentsPublished: published.length,
      crashesInPublishedSegments: publishedCrashes,
      projects: projects.length,
      projectsWithLocation: geolocated.length,
      projectsWithoutLocation: withoutLocation,
      crashYearMin: Math.min(...crashes.map((c) => c.properties.year)),
      crashYearMax: Math.max(...crashes.map((c) => c.properties.year)),
    },
    segments: published,
  }

  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n')
  console.log(
    `\nWrote src/data/corridors.json — ${published.length} segments covering ` +
      `${publishedCrashes} of ${placed.length} placed crashes ` +
      `(${Math.round((publishedCrashes / placed.length) * 100)}%).`,
  )
  const alreadyNamed = published.filter((s) => s.nameSource === 'already-a-street-name').length
  const failed = published.filter((s) => !s.streetName && s.nameSource !== 'already-a-street-name')
  console.log(`${alreadyNamed} segment(s) already carried a street name from VDOT — no lookup needed.`)
  if (failed.length) {
    console.log(
      `${failed.length} route-coded segment(s) could NOT be resolved and will show a bare code: ` +
        failed.map((s) => s.corridor).join(', ') +
        '. Re-run to retry — transient failures are not cached.',
    )
  }
}

main().catch((err) => {
  console.error('\nAnalysis failed:', err.message)
  process.exit(1)
})
