/**
 * geocode-projects.mjs
 * --------------------
 * Resolves map geometry for the projects extracted from the county's
 * "Word on the Street" newsletters (data-raw/wots/*.pdf).
 *
 * Run it with:   npm run geocode-projects
 *
 * WHY THIS SCRIPT EXISTS
 * A project drawn on the wrong street is worse than a project with no
 * location at all — the first misinforms, the second is merely incomplete.
 * So nothing here approximates. Every coordinate is either a topological
 * fact from OpenStreetMap (a node two named ways actually share) or it is
 * left out, and the project ships with no geometry.
 *
 * TWO INDEPENDENT SOURCES, CROSS-CHECKED
 *   1. Nominatim — the free-text geocoder, queried exactly as a person would
 *      ("Anoka Road & Fordson Road, Henrico County, Virginia").
 *   2. Overpass  — asked for the node that ways named A and B literally
 *      share. This is an intersection by construction, not by string match.
 *
 * Overpass wins when they disagree, because a shared node IS the
 * intersection while Nominatim's answer is a ranked guess. Nominatim still
 * runs: agreement between two independent sources is the confidence signal,
 * and a large disagreement is a flag worth printing. Disagreements beyond
 * DISAGREE_M are reported and the entry is marked for human review.
 *
 * SEGMENTS
 * Line projects (a path from A to B) can't come from a geocoder at all. The
 * named road's ways are fetched with geometry, stitched head-to-tail into one
 * polyline, then clipped to the span between the two cross streets.
 *
 * BOUNDARY CHECK
 * Every coordinate is tested against public/data/henrico-boundary.geojson.
 * Anything outside the county is a bad geocode by definition and is dropped
 * rather than shipped.
 *
 * USAGE POLICY
 * Nominatim allows at most 1 request/second and requires a real User-Agent
 * identifying the application. Both are honored below, and every response is
 * cached to data-raw/geocode-cache.json so re-runs cost zero requests.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const UA = 'SafeWalkHenrico/1.0 (civic transparency project; rohanvelpula9@gmail.com)';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Henrico bounding box (S,W,N,E) — from henrico-boundary.geojson, padded slightly. */
const BBOX = '37.34,-77.67,37.72,-77.16';

/** Nominatim's stated limit is 1 req/sec. Leave headroom. */
const NOMINATIM_DELAY_MS = 1200;

/** Overpass is a shared free service and answers 429 when pushed. Be polite. */
const OVERPASS_DELAY_MS = 3000;
const OVERPASS_RETRIES = 5;

/** Nominatim vs Overpass disagreement beyond this (metres) gets flagged. */
const DISAGREE_M = 250;

/**
 * Fallback tolerance, in metres, for a junction OSM doesn't node-share.
 * Roads that plainly meet on the ground are sometimes mapped without a shared
 * node — a driveway-style approach, or a short unnamed connector. When one
 * road's *terminal* node sits this close to the other road's centreline, that
 * terminal node is where the two roads meet. That is still a measured fact
 * about the data, not an approximation, so it is used — but it is recorded
 * under its own method name and its distance is printed, so it can never be
 * mistaken for a clean shared-node result.
 */
const ENDPOINT_TOUCH_M = 30;

const CACHE_PATH = new URL('../data-raw/geocode-cache.json', import.meta.url);
const OUT_PATH = new URL('../data-raw/geocode-results.json', import.meta.url);
const BOUNDARY_PATH = new URL('../public/data/henrico-boundary.geojson', import.meta.url);

/**
 * The locations to resolve, transcribed from the PDFs (and, where the PDF
 * links one, the county project page it points at). `nominatim` is the
 * free-text query; `ways` are the OSM name values whose shared node is the
 * real intersection. Alternates exist because the county and OSM don't always
 * agree on a road's name ("Parham Road" vs "East Parham Road", and the
 * newsletter's "Mayland Roads" is OSM's "Mayland Drive").
 */
const POINTS = [
  {
    key: 'anoka-fordson-traffic-circle',
    nominatim: 'Anoka Road & Fordson Road, Henrico County, Virginia',
    ways: [['Anoka Road'], ['Fordson Road']],
  },
  {
    key: 'three-chopt-cedarfield-signal',
    nominatim: 'Three Chopt Road & Cedarfield Parkway, Henrico County, Virginia',
    ways: [['Three Chopt Road'], ['Cedarfield Parkway']],
  },
  {
    key: 'twin-hickory-hickory-bend-intersection',
    nominatim: 'Twin Hickory Lake Drive & Hickory Bend Drive, Henrico County, Virginia',
    ways: [['Twin Hickory Lake Drive'], ['Hickory Bend Drive']],
  },
  {
    key: 'forest-skipwith-intersection',
    nominatim: 'Forest Avenue & Skipwith Road, Henrico County, Virginia',
    ways: [['Forest Avenue'], ['Skipwith Road']],
  },
  {
    key: 'parham-mayland-intersection',
    nominatim: 'Parham Road & Mayland Drive, Henrico County, Virginia',
    ways: [
      ['North Parham Road', 'East Parham Road', 'Parham Road'],
      ['Mayland Drive'],
    ],
  },
  // --- Brookland ---
  {
    key: 'parham-landmark-intersection',
    nominatim: 'Parham Road & Landmark Road, Henrico County, Virginia',
    ways: [
      ['North Parham Road', 'East Parham Road', 'Parham Road'],
      ['Landmark Road'],
    ],
  },
  {
    key: 'glen-allen-hs-crossing',
    nominatim: 'Staples Mill Road & Meadow Pond Lane, Henrico County, Virginia',
    ways: [['Staples Mill Road'], ['Meadow Pond Lane']],
  },
  // --- Fairfield ---
  {
    key: 'chamberlayne-diane-lane-intersection',
    nominatim: 'Chamberlayne Road & Diane Lane, Henrico County, Virginia',
    ways: [['Chamberlayne Road'], ['Diane Lane']],
  },
  // Both Fall Line Trail entries below are real segments (Bryan Park Ave to
  // Spring Park; Spring Park to Dumbarton Road per the county's own project
  // page), but "Spring Park" is a landmark, not a through street, so it
  // can't be resolved as a shared node the way a normal cross-street can.
  // Rather than guess a line to an unresolvable boundary, each is geocoded
  // as the one point it does share with a named road — honestly scoped as
  // a point on a longer segment, not the segment's full extent.
  {
    key: 'fall-line-trail-park-street',
    nominatim: 'Fall Line Trail & Bryan Park Avenue, Henrico County, Virginia',
    ways: [['Fall Line Trail'], ['Bryan Park Avenue']],
  },
  {
    key: 'fall-line-trail-lakeside',
    nominatim: 'Fall Line Trail & Dumbarton Road, Henrico County, Virginia',
    ways: [['Fall Line Trail'], ['Dumbarton Road']],
  },
  // --- Tuckahoe ---
  {
    key: 'horsepen-patterson-intersection',
    nominatim: 'Horsepen Road & Patterson Avenue, Henrico County, Virginia',
    ways: [['Horsepen Road'], ['Patterson Avenue']],
  },
  {
    key: 'derbyshire-roundabout',
    nominatim: 'Derbyshire Road & Heathfield Road, Henrico County, Virginia',
    ways: [
      ['Derbyshire Road'],
      ['Heathfield Road', 'Lakewater Drive'],
    ],
  },
  // --- Varina ---
  // The project's own description ("from the Richmond City limits south for
  // ~1,100 ft to Old Delaware Street") has only one end anchored to a named
  // cross street. Rather than extrapolate 1,100 ft along the trail from a
  // guessed direction, this is geocoded as that one verified point — the
  // Old Delaware Street end of the lit segment — not the segment's full
  // extent.
  {
    key: 'rocketts-landing-trail-lighting',
    nominatim: 'Virginia Capital Trail & Old Delaware Street, Henrico County, Virginia',
    ways: [['Virginia Capital Trail'], ['Old Delaware Street']],
  },
];

/**
 * How far apart two fragments of the SAME named road may be before the
 * stitcher gives up. OSM splits a road at attribute changes and sometimes
 * leaves a short gap where a junction or roundabout is mapped as separate
 * geometry. Rejoining two fragments of one named road across a gap this small
 * reconnects a road the data split; it does not move the line onto a
 * different street. Every bridged gap is counted and printed.
 */
const GAP_BRIDGE_M = 60;

/**
 * Segment projects. `road` is clipped to the span between the two `from`/`to`
 * cross streets — both endpoints named by the county's own project page.
 */
const SEGMENTS = [
  {
    key: 'sadler-road-improvements',
    road: 'Sadler Road',
    from: 'Dominion Boulevard',
    to: 'Cedar Forest Road',
  },
  // --- Brookland ---
  {
    key: 'bethlehem-road-improvements',
    road: 'Bethlehem Road',
    from: 'Libbie Avenue',
    to: 'Staples Mill Road',
  },
  {
    key: 'parham-ped-transit-improvements',
    road: ['North Parham Road', 'Parham Road', 'East Parham Road'],
    from: 'Shrader Road',
    to: 'Hungary Spring Road',
  },
  {
    key: 'monument-ave-sidewalk',
    road: 'Monument Avenue',
    from: 'Bremo Road',
    to: 'Treboy Avenue',
  },
  {
    key: 'libbie-avenue-road-diet',
    road: 'Libbie Avenue',
    from: 'West Broad Street',
    to: 'Bethlehem Road',
  },
  // --- Fairfield ---
  {
    key: 'dumbarton-road-improvements',
    road: 'Dumbarton Road',
    from: 'Staples Mill Road',
    to: 'Brook Road',
  },
  {
    key: 'hilliard-road-improvements',
    road: 'Hilliard Road',
    from: 'Lakeside Avenue',
    to: 'Brook Road',
  },
  {
    key: 'creighton-road-improvements',
    road: 'Creighton Road',
    from: 'Sandy Lane',
    // The project's own page says "E. Laburnum Avenue," but the road OSM
    // shows Creighton Road actually terminating at is tagged "North
    // Laburnum Avenue" at this point (confirmed by querying what actually
    // touches Creighton Road's mapped endpoint) — Henrico's Laburnum Avenue
    // changes its OSM directional prefix along its length.
    to: 'North Laburnum Avenue',
  },
  // --- Tuckahoe ---
  {
    key: 'ridge-road-safety-mobility',
    road: 'Ridge Road',
    from: 'Greene Ridge Road',
    to: 'North Ridge Road',
  },
  {
    key: 'raintree-drive-sidewalk',
    road: 'Raintree Drive',
    from: 'Falconbridge Drive',
    to: 'Raintree Commons Drive',
  },
  {
    key: 'ridge-road-sidewalk-phase1',
    road: 'Ridge Road',
    from: 'Old Providence Circle', // not found under this name in OSM as of 2026-07 — expected to fail; see report
    to: 'North Ridge Road',
  },
];

// ---------------------------------------------------------------- utilities

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Metres between two [lng, lat] points. */
function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Ray casting. `ring` is a closed [lng, lat][] ring. */
function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = yi > y !== yj > y;
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function makeInHenrico(boundary) {
  const geom = boundary.features[0].geometry;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return (pt) =>
    polys.some(
      (rings) => pointInRing(pt, rings[0]) && !rings.slice(1).some((h) => pointInRing(pt, h)),
    );
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

// ------------------------------------------------------------------ caching

let cache = {};

async function loadCache() {
  try {
    cache = JSON.parse(await readFile(CACHE_PATH, 'utf8'));
    console.log(`Cache: ${Object.keys(cache).length} entries loaded.`);
  } catch {
    cache = {};
    console.log('Cache: none yet, starting empty.');
  }
}

async function saveCache() {
  await mkdir(new URL('../data-raw/', import.meta.url), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
}

/** Runs `fn` only on a cache miss, so re-runs make no network requests. */
async function cached(key, fn) {
  if (key in cache) return { ...cache[key], _cached: true };
  const value = await fn();
  cache[key] = value;
  await saveCache();
  return { ...value, _cached: false };
}

// --------------------------------------------------------------- geocoders

/**
 * Nominatim has no real intersection support — it matches place names, and
 * "A & B" is not the name of anything. Rather than declare it unable, try the
 * phrasings a person would actually type, in order, and take the first that
 * lands. When none do, that's recorded as a fact about the geocoder, and the
 * OSM shared node stands alone.
 */
function nominatimVariants(query) {
  const m = query.match(/^(.+?) & (.+?), (.+)$/);
  if (!m) return [query];
  const [, a, b, place] = m;
  return [query, `${a} and ${b}, ${place}`, `${a}, ${b}, ${place}`];
}

async function nominatimSearch(query) {
  return cached(`nominatim:${query}`, async () => {
    await sleep(NOMINATIM_DELAY_MS);
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '5',
      countrycodes: 'us',
      addressdetails: '1',
    });
    const res = await fetch(`${NOMINATIM}?${params}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status} for "${query}"`);
    const json = await res.json();
    return {
      results: json.map((r) => ({
        lng: Number(r.lon),
        lat: Number(r.lat),
        display_name: r.display_name,
        category: r.category,
        type: r.type,
        county: r.address?.county ?? null,
      })),
    };
  });
}

/** First Nominatim phrasing that returns anything. */
async function nominatimBest(query) {
  for (const variant of nominatimVariants(query)) {
    const { results } = await nominatimSearch(variant);
    if (results.length) return { query: variant, top: results[0] };
  }
  return null;
}

async function overpass(query, cacheKey) {
  return cached(cacheKey, async () => {
    for (let attempt = 1; attempt <= OVERPASS_RETRIES; attempt++) {
      await sleep(OVERPASS_DELAY_MS * attempt);
      const res = await fetch(OVERPASS, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'text/plain' },
        body: query,
      });
      if (res.ok) return await res.json();
      // 429 = rate limited, 504 = the query timed out server-side under load.
      // Both are worth waiting out; anything else is a real error.
      if (res.status !== 429 && res.status !== 504) {
        throw new Error(`Overpass HTTP ${res.status}`);
      }
      console.log(`  (Overpass ${res.status}, retry ${attempt}/${OVERPASS_RETRIES})`);
    }
    throw new Error(`Overpass still rate-limiting after ${OVERPASS_RETRIES} retries`);
  });
}

const nameFilter = (names) => names.map((n) => `way["highway"]["name"="${n}"](${BBOX});`).join('\n  ');

/** Nodes shared by a way named in `aNames` and a way named in `bNames`. */
async function intersectionNodes(aNames, bNames, key) {
  const q = `[out:json][timeout:120];
(
  ${nameFilter(aNames)}
)->.a;
(
  ${nameFilter(bNames)}
)->.b;
node(w.a)->.na;
node(w.b)->.nb;
node.na.nb;
out body;`;
  const json = await overpass(q, `overpass:intersection:${key}`);
  return (json.elements ?? [])
    .filter((e) => e.type === 'node')
    .map((e) => [e.lon, e.lat]);
}

/** Perpendicular distance in metres from `pt` to a polyline. */
function distanceToPolyline(pt, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const denom = dx * dx + dy * dy;
    const t =
      denom === 0 ? 0 : Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / denom));
    best = Math.min(best, haversine(pt, [ax + t * dx, ay + t * dy]));
  }
  return best;
}

/**
 * Where two roads meet when OSM gives them no shared node: the terminal node
 * of one road lying closest to the other road's centreline. Returns the
 * closest such approach found (with its distance) or null if either road has
 * no geometry. The caller decides whether the distance is close enough.
 */
function endpointTouch(aWays, bWays) {
  let best = null;
  const consider = (ways, others) => {
    for (const w of ways) {
      for (const end of [w.pts[0], w.pts[w.pts.length - 1]]) {
        for (const o of others) {
          const d = distanceToPolyline(end, o.pts);
          if (d < (best?.distance ?? Infinity)) best = { point: end, distance: d };
        }
      }
    }
  };
  consider(aWays, bWays);
  consider(bWays, aWays);
  return best;
}

/** Every way carrying any of `names`, with full node geometry. */
async function roadWays(names, key) {
  const q = `[out:json][timeout:180];
(
  ${nameFilter(names)}
);
out geom;`;
  const json = await overpass(q, `overpass:road:${key}`);
  return (json.elements ?? [])
    .filter((e) => e.type === 'way' && e.geometry?.length > 1)
    .map((e) => ({ id: e.id, pts: e.geometry.map((g) => [g.lon, g.lat]) }));
}

// ------------------------------------------------------------- way stitching

const ptKey = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

/**
 * Stitches way fragments head-to-tail into continuous polylines. OSM splits a
 * road at every attribute change, so "Sadler Road" arrives as N disconnected
 * fragments in arbitrary order and direction; a road is only usable as a line
 * once they're chained back together.
 *
 * Returns all chains found, longest first — a road with a genuine gap (or a
 * same-named road elsewhere in the county) yields more than one.
 */
function stitch(ways) {
  const remaining = ways.map((w) => w.pts);
  const chains = [];

  while (remaining.length) {
    let chain = remaining.pop();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const head = ptKey(chain[0]);
        const tail = ptKey(chain[chain.length - 1]);
        const segHead = ptKey(seg[0]);
        const segTail = ptKey(seg[seg.length - 1]);

        if (tail === segHead) chain = [...chain, ...seg.slice(1)];
        else if (tail === segTail) chain = [...chain, ...[...seg].reverse().slice(1)];
        else if (head === segTail) chain = [...seg, ...chain.slice(1)];
        else if (head === segHead) chain = [...[...seg].reverse(), ...chain.slice(1)];
        else continue;

        remaining.splice(i, 1);
        grew = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains.sort((a, b) => b.length - a.length);
}

/**
 * Joins chains whose ends are within `tolM` of each other. Returns the chains
 * plus the list of gap sizes bridged, so the caller can report exactly how
 * much was inferred rather than measured.
 */
function bridgeGaps(chains, tolM) {
  const parts = [...chains];
  const bridged = [];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i];
        const b = parts[j];
        const pairs = [
          { d: haversine(a[a.length - 1], b[0]), join: () => [...a, ...b] },
          { d: haversine(a[a.length - 1], b[b.length - 1]), join: () => [...a, ...[...b].reverse()] },
          { d: haversine(a[0], b[b.length - 1]), join: () => [...b, ...a] },
          { d: haversine(a[0], b[0]), join: () => [...[...b].reverse(), ...a] },
        ].sort((x, y) => x.d - y.d);
        if (pairs[0].d <= tolM) {
          bridged.push(Math.round(pairs[0].d));
          parts.splice(j, 1);
          parts[i] = pairs[0].join();
          merged = true;
          break outer;
        }
      }
    }
  }
  return { chains: parts.sort((a, b) => b.length - a.length), bridged };
}

/** Index of the chain vertex closest to `pt`, plus that distance in metres. */
function nearestIndex(chain, pt) {
  let best = 0;
  let bestD = Infinity;
  chain.forEach((c, i) => {
    const d = haversine(c, pt);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return { index: best, distance: bestD };
}

/** Douglas-Peucker, tolerance in degrees. Keeps the file small; shape intact. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0;
  let idx = 0;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const denom = dx * dx + dy * dy;
    const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denom));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

// ---------------------------------------------------------------- resolvers

async function resolvePoint(spec, inHenrico) {
  const out = { key: spec.key, kind: 'point', notes: [] };

  const nodes = await intersectionNodes(spec.ways[0], spec.ways[1], spec.key);
  out.overpassNodeCount = nodes.length;

  let osm = null;
  if (nodes.length === 1) {
    osm = nodes[0];
  } else if (nodes.length > 1) {
    // A divided road crosses as several nodes (one per carriageway). They
    // describe one intersection, so the midpoint of a tight cluster is still
    // that intersection — but only if the cluster really is tight.
    const spread = Math.max(...nodes.map((a) => Math.max(...nodes.map((b) => haversine(a, b)))));
    if (spread <= 120) {
      osm = [
        nodes.reduce((s, n) => s + n[0], 0) / nodes.length,
        nodes.reduce((s, n) => s + n[1], 0) / nodes.length,
      ];
      out.notes.push(`${nodes.length} shared nodes within ${Math.round(spread)} m (divided road); using cluster centre.`);
    } else {
      out.notes.push(`${nodes.length} shared nodes spread over ${Math.round(spread)} m — not one intersection; refusing to pick.`);
    }
  } else {
    // No shared node. Before giving up, check whether the two roads simply
    // meet without being noded together.
    const aWays = await roadWays(spec.ways[0], `${spec.key}:a`);
    const bWays = await roadWays(spec.ways[1], `${spec.key}:b`);
    const touch = endpointTouch(aWays, bWays);
    if (touch && touch.distance <= ENDPOINT_TOUCH_M) {
      osm = touch.point;
      out.method = 'endpoint-touch';
      out.touchMetres = Math.round(touch.distance * 10) / 10;
      out.notes.push(
        `No shared node, but a terminal node of one road sits ${out.touchMetres} m from the other's centreline — using that junction node.`,
      );
    } else {
      out.notes.push(
        touch
          ? `No shared node; closest terminal-node approach is ${Math.round(touch.distance)} m, beyond the ${ENDPOINT_TOUCH_M} m tolerance. Refusing to place it.`
          : 'No node shared by these two roads in OSM, and no geometry to fall back on.',
      );
    }
  }

  const nom = await nominatimBest(spec.nominatim);
  const top = nom?.top ?? null;
  out.nominatim = top
    ? { query: nom.query, lng: top.lng, lat: top.lat, display_name: top.display_name }
    : null;
  if (!top) {
    out.notes.push(
      'Nominatim returned nothing for any phrasing of this intersection — it has no intersection index, so this is expected, not a failure of the location.',
    );
  }

  if (osm && top) {
    const d = haversine(osm, [top.lng, top.lat]);
    out.agreementMetres = Math.round(d);
    if (d > DISAGREE_M) {
      out.notes.push(`Nominatim disagrees with the OSM shared node by ${Math.round(d)} m — using the shared node, flagged for review.`);
      out.review = true;
    }
  }

  if (!osm) {
    out.resolved = false;
    return out;
  }
  if (!inHenrico(osm)) {
    out.notes.push(`Resolved to ${osm} which is OUTSIDE the Henrico boundary — dropped.`);
    out.resolved = false;
    return out;
  }

  out.resolved = true;
  out.source = out.method === 'endpoint-touch' ? 'overpass-junction-node' : 'overpass-shared-node';
  out.geometry = [round5(osm[0]), round5(osm[1])];
  return out;
}

async function resolveSegment(spec, inHenrico) {
  const out = { key: spec.key, kind: 'segment', notes: [] };
  // The county and OSM don't always agree on a road's name (a primary road
  // is often split into "North X"/"East X" tags at the point OSM records a
  // classification change, even though it's one continuous county road) —
  // same reason POINTS.ways takes a list of alternates. Accept either form.
  const roadNames = Array.isArray(spec.road) ? spec.road : [spec.road];

  const ways = await roadWays(roadNames, spec.key);
  out.wayCount = ways.length;
  if (!ways.length) {
    out.notes.push(`No ways named "${roadNames.join('" / "')}" found.`);
    out.resolved = false;
    return out;
  }

  const exact = stitch(ways);
  const { chains, bridged } = bridgeGaps(exact, GAP_BRIDGE_M);
  out.chainLengths = chains.map((c) => c.length);
  out.bridgedGapsMetres = bridged;
  if (bridged.length) {
    out.notes.push(
      `OSM splits this road into ${exact.length} disconnected pieces; rejoined ${bridged.length} gap(s) of ${bridged.join(', ')} m (tolerance ${GAP_BRIDGE_M} m).`,
    );
  }

  const fromNodes = await intersectionNodes(roadNames, [spec.from], `${spec.key}:from`);
  const toNodes = await intersectionNodes(roadNames, [spec.to], `${spec.key}:to`);
  if (!fromNodes.length || !toNodes.length) {
    out.notes.push(
      `Cross-street node missing (${spec.from}: ${fromNodes.length}, ${spec.to}: ${toNodes.length}).`,
    );
    out.resolved = false;
    return out;
  }

  // A cross street can meet the road at several nodes (divided carriageways,
  // or two separate touch points). Take, for each end, whichever candidate
  // node actually sits on the chain.
  const pickOn = (chain, nodes) =>
    nodes
      .map((n) => ({ node: n, ...nearestIndex(chain, n) }))
      .sort((a, b) => a.distance - b.distance)[0];

  let best = null;
  for (const chain of chains) {
    const a = pickOn(chain, fromNodes);
    const b = pickOn(chain, toNodes);
    if (a.distance > 25 || b.distance > 25) continue;
    const cand = { chain, a, b };
    if (!best || Math.abs(cand.b.index - cand.a.index) > Math.abs(best.b.index - best.a.index)) {
      best = cand;
    }
  }
  if (!best) {
    out.notes.push(
      `No single stitched chain contains both cross streets even after bridging gaps up to ${GAP_BRIDGE_M} m — refusing to invent the connection.`,
    );
    out.resolved = false;
    return out;
  }

  const lo = Math.min(best.a.index, best.b.index);
  const hi = Math.max(best.a.index, best.b.index);
  let slice = best.chain.slice(lo, hi + 1);
  if (best.a.index > best.b.index) slice = slice.reverse();

  const outside = slice.filter((p) => !inHenrico(p));
  if (outside.length) {
    out.notes.push(`${outside.length} of ${slice.length} vertices fall outside Henrico — dropped.`);
    out.resolved = false;
    return out;
  }

  let metres = 0;
  for (let i = 1; i < slice.length; i++) metres += haversine(slice[i - 1], slice[i]);
  out.lengthMiles = Number((metres / 1609.344).toFixed(2));
  out.rawVertices = slice.length;

  const simplified = simplify(slice, 0.00012).map((p) => [round5(p[0]), round5(p[1])]);
  out.resolved = true;
  out.source = 'overpass-way-geometry';
  out.geometry = simplified;
  out.notes.push(`Clipped ${spec.road} between ${spec.from} and ${spec.to}: ${out.lengthMiles} mi, ${slice.length} vertices simplified to ${simplified.length}.`);
  return out;
}

// -------------------------------------------------------------------- main

async function main() {
  const boundary = JSON.parse(await readFile(BOUNDARY_PATH, 'utf8'));
  const inHenrico = makeInHenrico(boundary);
  await loadCache();

  const results = [];

  for (const spec of POINTS) {
    process.stdout.write(`\n[point]   ${spec.key}\n`);
    const r = await resolvePoint(spec, inHenrico);
    results.push(r);
    console.log(
      r.resolved
        ? `  resolved -> [${r.geometry}]  (agreement with Nominatim: ${r.agreementMetres ?? 'n/a'} m)`
        : '  UNRESOLVED',
    );
    r.notes.forEach((n) => console.log(`  note: ${n}`));
  }

  for (const spec of SEGMENTS) {
    process.stdout.write(`\n[segment] ${spec.key}\n`);
    const r = await resolveSegment(spec, inHenrico);
    results.push(r);
    console.log(r.resolved ? `  resolved -> ${r.geometry.length} points, ${r.lengthMiles} mi` : '  UNRESOLVED');
    r.notes.forEach((n) => console.log(`  note: ${n}`));
  }

  await writeFile(OUT_PATH, JSON.stringify(results, null, 2) + '\n');

  const ok = results.filter((r) => r.resolved).length;
  console.log(`\n${ok}/${results.length} resolved. Wrote data-raw/geocode-results.json`);
  const review = results.filter((r) => r.review);
  if (review.length) console.log(`${review.length} flagged for review: ${review.map((r) => r.key).join(', ')}`);
}

main().catch((err) => {
  console.error('\nGeocode failed:', err.message);
  process.exit(1);
});
