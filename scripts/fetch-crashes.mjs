/**
 * fetch-crashes.mjs
 * -----------------
 * Downloads pedestrian- and bicyclist-involved crashes in Henrico County
 * from VDOT's public crash data layer and writes them to
 * public/data/crashes.geojson (which is committed to the repo, so the site
 * works without anyone re-running this).
 *
 * Run it with:   npm run fetch-crashes     (or: node scripts/fetch-crashes.mjs)
 * No API key needed. Takes a few seconds.
 *
 * DATA SOURCE
 * The layer behind VDOT's "CrashData basic" dataset on the Virginia Roads
 * open data portal (virginiaroads-vdot.opendata.arcgis.com). The service
 * path says "CrashData_test", but the portal's canonical "CrashData Basic"
 * dataset (owned by "Virginia Department of Transportation") points exactly
 * here — verified 2026-07. Crash records originate from DMV's TREDS system.
 *
 * FIELD MAPPING (verified against the live layer, 2026-07):
 *   CRASH_YEAR      string  e.g. "2024"
 *   CRASH_SEVERITY  string  KABCO scale: K = fatal, A/B/C = injury, O = property damage only
 *   PED_NONPED      string  "Yes" when a pedestrian was involved, else "No"
 *   BIKE_NONBIKE    string  "Yes" when a bicyclist was involved, else "No"
 *   JURIS_CODE      string  "43" is Henrico County ("043. Henrico County" in PHYSICAL_JURIS)
 * Geometry: points; we request outSR=4326 to get plain longitude/latitude.
 *
 * If VDOT renames fields, the script fails loudly (see verifySchema below)
 * instead of silently writing wrong data.
 */

const LAYER_URL =
  'https://services.arcgis.com/p5v98VHDX9Atv3l7/arcgis/rest/services/CrashData_test/FeatureServer/2';

const OUT_FILE = new URL('../public/data/crashes.geojson', import.meta.url);

// The five most recent FULL calendar years (this year is still in progress,
// so it would under-count if included).
const LAST_FULL_YEAR = new Date().getFullYear() - 1;
const YEARS = Array.from({ length: 5 }, (_, i) => String(LAST_FULL_YEAR - 4 + i));

const FIELDS = ['CRASH_YEAR', 'CRASH_SEVERITY', 'PED_NONPED', 'BIKE_NONBIKE'];

const WHERE = [
  `JURIS_CODE='43'`, // Henrico County only
  `(PED_NONPED='Yes' OR BIKE_NONBIKE='Yes')`, // person walking or biking involved
  `CRASH_YEAR IN (${YEARS.map((y) => `'${y}'`).join(',')})`,
].join(' AND ');

/** Small helper: fetch a URL and parse JSON, with a clear error message. */
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const json = await res.json();
  if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
  return json;
}

/** Fail loudly if the layer's schema no longer matches what we coded against. */
async function verifySchema() {
  const meta = await getJson(`${LAYER_URL}?f=json`);
  const names = new Set((meta.fields ?? []).map((f) => f.name));
  const missing = [...FIELDS, 'JURIS_CODE'].filter((f) => !names.has(f));
  if (missing.length > 0) {
    throw new Error(
      `The VDOT layer no longer has these fields: ${missing.join(', ')}.\n` +
        `Open ${LAYER_URL}?f=json in a browser, find the new names, and update this script.`
    );
  }
  return meta.maxRecordCount ?? 2000;
}

/** Page through the layer (ArcGIS caps each response at maxRecordCount). */
async function fetchAllFeatures(pageSize) {
  const features = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      where: WHERE,
      outFields: FIELDS.join(','),
      outSR: '4326', // plain longitude/latitude
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: 'json',
    });
    const page = await getJson(`${LAYER_URL}/query?${params}`);
    features.push(...(page.features ?? []));
    if (!page.exceededTransferLimit) break;
    offset += page.features.length;
    process.stdout.write(`  fetched ${features.length} so far...\n`);
  }
  return features;
}

/** KABCO severity → the three classes the map shows. */
function severityClass(kabco) {
  if (kabco === 'K') return 'fatal';
  if (kabco === 'A' || kabco === 'B' || kabco === 'C') return 'injury';
  return 'other'; // O = property damage only, plus anything unexpected
}

function round5(n) {
  return Math.round(n * 1e5) / 1e5;
}

async function main() {
  console.log(`Fetching Henrico ped/bike crashes for ${YEARS[0]}–${YEARS[YEARS.length - 1]}...`);
  const pageSize = await verifySchema();
  const raw = await fetchAllFeatures(pageSize);

  const features = raw
    .filter((f) => f.geometry && Number.isFinite(f.geometry.x) && Number.isFinite(f.geometry.y))
    .map((f) => {
      const a = f.attributes;
      const ped = a.PED_NONPED === 'Yes';
      const bike = a.BIKE_NONBIKE === 'Yes';
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [round5(f.geometry.x), round5(f.geometry.y)],
        },
        properties: {
          year: Number(a.CRASH_YEAR),
          // "ped" | "bike" | "both" — a crash can involve both.
          mode: ped && bike ? 'both' : ped ? 'ped' : 'bike',
          sev: severityClass(a.CRASH_SEVERITY),
        },
      };
    });

  const collection = {
    type: 'FeatureCollection',
    // Metadata the site reads to caption the layer honestly.
    properties: {
      source: 'VDOT CrashData basic (Virginia Roads open data portal)',
      sourceUrl: 'https://virginiaroads-vdot.opendata.arcgis.com/',
      fetched: new Date().toISOString().slice(0, 10),
      years: YEARS.map(Number),
      jurisdiction: 'Henrico County (JURIS_CODE 43)',
      sample: false, // true only in crashes.sample.geojson
    },
    features,
  };

  const json = JSON.stringify(collection);
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
  await writeFile(OUT_FILE, json);

  // Emit the year range as a tiny committed module the UI imports
  // synchronously, so the filter controls and captions always match the
  // data — the range can never silently lag behind a refresh.
  await writeFile(
    new URL('../src/data/crashYears.json', import.meta.url),
    JSON.stringify({ min: Number(YEARS[0]), max: Number(YEARS[YEARS.length - 1]) }) + '\n'
  );

  const mb = json.length / 1024 / 1024;
  console.log(`Wrote ${features.length} crashes (${mb.toFixed(2)} MB) to public/data/crashes.geojson`);
  console.log(`Wrote src/data/crashYears.json (${YEARS[0]}–${YEARS[YEARS.length - 1]})`);
  if (mb > 4) {
    console.warn(
      'WARNING: file is over 4 MB. Consider narrowing YEARS in this script and re-running.'
    );
  }
}

main().catch((err) => {
  console.error('\nFetch failed:', err.message);
  console.error(
    'The site will keep working with the last committed crashes.geojson.\n' +
      'If that file is missing, the map falls back to sample data and shows a banner.'
  );
  process.exit(1);
});
