/**
 * make-sample-crashes.mjs
 * -----------------------
 * Generates public/data/crashes.sample.geojson — ~40 clearly SYNTHETIC crash
 * points scattered around Henrico. This is the safety net: the app loads it
 * only when the real public/data/crashes.geojson is missing, and always shows
 * an unmissable "sample data" banner when it does. Sample data is never
 * presented as real.
 *
 *   node scripts/make-sample-crashes.mjs
 *
 * The points use a fixed pseudo-random sequence (seeded) so re-runs are
 * identical and the file diffs cleanly.
 */
import { writeFile } from 'node:fs/promises'

// Henrico bounding box (roughly), matching the real data's spread.
const BBOX = { minLng: -77.64, maxLng: -77.25, minLat: 37.44, maxLat: 37.7 }

// Deterministic PRNG (mulberry32) so output is stable across runs.
let seed = 0x5afe_0a1c >>> 0
function rand() {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const YEARS = [2021, 2022, 2023, 2024, 2025]
const MODES = ['ped', 'ped', 'ped', 'bike'] // weight toward pedestrians, like the real data
const SEVS = ['injury', 'injury', 'injury', 'injury', 'fatal', 'other']

const round5 = (n) => Math.round(n * 1e5) / 1e5

const features = Array.from({ length: 40 }, () => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [
      round5(BBOX.minLng + rand() * (BBOX.maxLng - BBOX.minLng)),
      round5(BBOX.minLat + rand() * (BBOX.maxLat - BBOX.minLat)),
    ],
  },
  properties: {
    year: YEARS[Math.floor(rand() * YEARS.length)],
    mode: MODES[Math.floor(rand() * MODES.length)],
    sev: SEVS[Math.floor(rand() * SEVS.length)],
  },
}))

const collection = {
  type: 'FeatureCollection',
  properties: {
    source: 'SYNTHETIC sample data — not real crashes',
    sample: true, // the app reads this and shows the sample-data banner
  },
  features,
}

await writeFile(
  new URL('../public/data/crashes.sample.geojson', import.meta.url),
  JSON.stringify(collection),
)
console.log(`Wrote ${features.length} synthetic sample crashes to public/data/crashes.sample.geojson`)
