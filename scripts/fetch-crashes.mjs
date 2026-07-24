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
 * WHY THE API, NOT A CSV SNAPSHOT (decided 2026-07): a hand-pulled export
 * (976 Henrico ped/bike records, 2017-2026, 69 columns) was checked against
 * this same live layer field-by-field. Every needed column has a live
 * equivalent with a matching alias (Light Condition, School Zone, Traffic
 * Control Type, Hit & Run?, Crash Military Time, Pedestrians Killed/Injured),
 * and three spot-checked records (by OBJECTID) matched the API exactly —
 * date, time, severity, mode, school zone, light, hit-run, route, and
 * coordinates, to the decimal. So the API stays authoritative and the
 * pipeline stays reproducible; no manual snapshot needed.
 *
 * FIELD MAPPING (verified against the live layer, 2026-07):
 *   CRASH_YEAR            string   e.g. "2024"
 *   CRASH_DT               number   epoch ms, midnight LOCAL (Eastern) time —
 *                                   see toEasternISODate(); naive UTC slicing
 *                                   shifts the date near midnight
 *   CRASH_MILITARY_TM      string   "0"-"2359", NOT zero-padded (e.g. "138" = 01:38)
 *   CRASH_SEVERITY         string   KABCO scale: K = fatal, A/B/C = injury, O = property damage only
 *   PED_NONPED              string   "Yes" when a pedestrian was involved, else "No"
 *   BIKE_NONBIKE            string   "Yes" when a bicyclist was involved, else "No"
 *   JURIS_CODE              string   "43" is Henrico County ("043. Henrico County" in PHYSICAL_JURIS)
 *   RTE_NM                  string   VDOT linear-referencing route name — see deriveLocation()
 *   SCHOOL_ZONE             string   "1. Yes" / "2. Yes - With School Activity" / "3. No" / "Not Applicable"
 *   LIGHT_CONDITION         string   "N. Label" — see stripNumberPrefix()
 *   TRAFFIC_CONTROL_TYPE    string   "N. Label" — see stripNumberPrefix()
 *   HITRUN_NOT_HITRUN       string   "Yes" / "No"
 *   PEDESTRIANS_KILLED      number   fetched for a sanity cross-check only (see main()) — NOT
 *                                   shipped in the GeoJSON. It undercounts fatal ped/bike
 *                                   crashes: it counts only pedestrian deaths, so a fatal
 *                                   BICYCLIST crash (K severity, ped=No/bike=Yes) reads 0 here.
 *                                   CRASH_SEVERITY='K' is the correct "fatal" signal for this
 *                                   site and is what severityClass() below uses.
 * Geometry: points; we request outSR=4326 to get plain longitude/latitude.
 *
 * If VDOT renames fields, the script fails loudly (see verifySchema below)
 * instead of silently writing wrong data.
 */

const LAYER_URL =
  'https://services.arcgis.com/p5v98VHDX9Atv3l7/arcgis/rest/services/CrashData_test/FeatureServer/2';

const OUT_FILE = new URL('../public/data/crashes.geojson', import.meta.url);

// Dataset floor: 2017, matching the range verified against Henrico's full
// pedestrian/cyclist crash export (2026-07 audit) — VDOT's layer goes back
// further, but this site's scope was deliberately set at 2017. Ceiling is
// always "this year," even though it will be partial — Task 1's requirement
// is to show the partial year clearly, not hide it. `min`/`max` written to
// crashYears.json below are recomputed from the ACTUAL fetched data, not
// from these query bounds, so an edge case (e.g. running this on Jan 1
// before any current-year crash is in the system yet) can't ship a year
// with zero crashes as if it had data.
const MIN_YEAR = 2017;
const MAX_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => String(MIN_YEAR + i));

const FIELDS = [
  'CRASH_YEAR',
  'CRASH_DT',
  'CRASH_MILITARY_TM',
  'CRASH_SEVERITY',
  'PED_NONPED',
  'BIKE_NONBIKE',
  'RTE_NM',
  'SCHOOL_ZONE',
  'LIGHT_CONDITION',
  'TRAFFIC_CONTROL_TYPE',
  'HITRUN_NOT_HITRUN',
  'PEDESTRIANS_KILLED', // sanity-check only, see file header — not shipped
];

/**
 * Turn VDOT's RTE_NM into a human-readable road name.
 *
 * RTE_NM is a linear-referencing route identifier, not free text. Exactly two
 * shapes appear across all 976 Henrico ped/bike records 2017-2026 (verified,
 * zero nulls):
 *
 *   "S-VA043PR THREE CHOPT RD"        county/secondary route — carries the
 *   "U-VA043SC STAPLES MILL RD"       real street name verbatim after the prefix
 *   "R-VA   US00250WB"                state-maintained route — fixed-width code:
 *                                     system (US/SR/IS/FR) + 5-digit number + direction
 *   "R-VA   IS00064WB      RMP178.00A" same, on a ramp (RMP = ramp milepost)
 *
 * We surface the street name exactly as the source gives it (only adjusting
 * capitalisation for readability), and decode the fixed-width designator into
 * its standard form (US 250 WB, I-64 WB ramp). We never reverse-geocode and
 * never invent a name the source does not contain: "UK" (VDOT's unknown
 * direction) is dropped, and route 99999 / unrecognised shapes yield '' so the
 * table can honestly show "Not recorded" rather than a guess.
 */
function deriveLocation(rteNm) {
  if (!rteNm) return '';
  const raw = String(rteNm).trim();

  // State-maintained route, optionally a ramp:
  //   "R-VA   US00250WB", "R-VA   IS00064WB      RMP178.00A"
  const state = raw.match(/^R-VA\s+(US|SR|IS|FR)(\d+)([NSEW]B|UK)?(?:\s+RMP\S*)?$/);
  if (state) {
    const [, system, digits, dir] = state;
    const number = Number(digits);
    if (!Number.isFinite(number) || number === 0 || number === 99999) return '';
    const label = system === 'IS' ? `I-${number}` : `${system} ${number}`;
    const withDir = dir && dir !== 'UK' ? `${label} ${dir}` : label;
    return /\sRMP/.test(raw) ? `${withDir} ramp` : withDir;
  }

  // County/secondary/urban route carrying a literal street name.
  const local = raw.match(/^[SU]-VA\d{3}[A-Z]{2}\s+(.+)$/);
  if (local) return titleCaseStreet(local[1]);

  return '';
}

/** "S LABURNUM AVE" -> "S Laburnum Ave". Directionals and short tokens stay
 *  uppercase; this only changes letter case, never the words themselves. */
function titleCaseStreet(name) {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (/^[nsew]{1,2}$/.test(word)) return word.toUpperCase(); // N, S, E, W, NE...
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/** "4. Darkness - Road Lighted" -> "Darkness - Road Lighted". VDOT prefixes
 *  every coded category with its numeric value; the site only wants the label. */
function stripNumberPrefix(value) {
  if (!value) return '';
  return String(value).replace(/^\d+\.\s*/, '').trim();
}

/** SCHOOL_ZONE is "1. Yes" / "2. Yes - With School Activity" / "3. No" /
 *  "Not Applicable". Both Yes variants count — verified this sums to exactly
 *  38 of 976, matching the figure the site is built around. Collapsed to a
 *  boolean because that's the only distinction Task 5 asks this site to
 *  surface; the "with school activity" nuance isn't dropped from the source,
 *  just not exposed as a second filter dimension. */
function isSchoolZone(value) {
  return /^[12]\./.test(String(value ?? '').trim());
}

/** CRASH_MILITARY_TM is unpadded ("138" = 01:38, not 13:80) — pad before
 *  splitting, or short times parse wrong. */
function formatTime(militaryTime) {
  if (militaryTime === null || militaryTime === undefined || militaryTime === '') return '';
  const padded = String(militaryTime).padStart(4, '0');
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}

/** Four even 6-hour bands for filtering — exact minutes aren't useful as a
 *  filter axis, but a handful of named bands are. */
function timeBand(militaryTime) {
  if (militaryTime === null || militaryTime === undefined || militaryTime === '') return '';
  const hour = Number(String(militaryTime).padStart(4, '0').slice(0, 2));
  if (hour < 6) return 'overnight';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** VDOT's CRASH_DT is epoch milliseconds at LOCAL midnight, not UTC midnight
 *  (verified: 2017-08-24's crash reads as 04:00 or 05:00 UTC depending on the
 *  time of year, i.e. midnight Eastern, shifted by DST). Formatting it with
 *  plain toISOString() would read back a day early for roughly half the
 *  year — the same class of bug fixed for day-since-announced counters
 *  earlier in this project. Format in the Eastern zone instead. */
const EASTERN_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function toEasternISODate(epochMs) {
  return EASTERN_DATE.format(new Date(epochMs)); // en-CA formats as YYYY-MM-DD
}

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

/**
 * Total Henrico crash count (ALL crash types, not just ped/bike) for the 5
 * most recent COMPLETE calendar years — used only for the homepage's "share
 * of all crashes" framing (Task 4: "540 of 26,541 Henrico crashes, about 2%,
 * involved someone walking or biking"). This can't be derived from
 * crashes.geojson, which is deliberately ped/bike-only, so it's fetched here
 * as its own tiny committed number and re-verified every time this script
 * runs, rather than typed in once and left to go stale. Uses a rolling
 * 5-complete-year window (independent of MIN_YEAR/MAX_YEAR above, which
 * cover the full ped/bike history) so the comparison window advances on its
 * own with each re-fetch instead of freezing at "2021-2025" forever.
 */
async function fetchAllCrashContext(pedBikeFeatures) {
  const end = new Date().getFullYear() - 1; // last complete year
  const years = Array.from({ length: 5 }, (_, i) => String(end - 4 + i));
  const where = `JURIS_CODE='43' AND CRASH_YEAR IN (${years.map((y) => `'${y}'`).join(',')})`;
  const params = new URLSearchParams({ where, returnCountOnly: 'true', f: 'json' });
  const result = await getJson(`${LAYER_URL}/query?${params}`);
  const allCrashes = result.count;
  const pedBikeInWindow = pedBikeFeatures.filter(
    (f) => f.properties.year >= Number(years[0]) && f.properties.year <= Number(years[years.length - 1])
  ).length;
  return {
    years: years.map(Number),
    allCrashes,
    pedBikeCrashes: pedBikeInWindow,
  };
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
          date: Number.isFinite(a.CRASH_DT) ? toEasternISODate(a.CRASH_DT) : '',
          time: formatTime(a.CRASH_MILITARY_TM),
          timeBand: timeBand(a.CRASH_MILITARY_TM),
          // "ped" | "bike" | "both" — a crash can involve both.
          mode: ped && bike ? 'both' : ped ? 'ped' : 'bike',
          sev: severityClass(a.CRASH_SEVERITY),
          // Road name from VDOT's own RTE_NM; '' when the source has none.
          loc: deriveLocation(a.RTE_NM),
          light: stripNumberPrefix(a.LIGHT_CONDITION),
          trafficControl: stripNumberPrefix(a.TRAFFIC_CONTROL_TYPE),
          hitRun: a.HITRUN_NOT_HITRUN === 'Yes',
          schoolZone: isSchoolZone(a.SCHOOL_ZONE),
        },
      };
    });

  // Bounds come from the fetched DATA, not the query range, so a partially-
  // populated edge year (e.g. running this before the new year's first crash
  // has been entered) can't ship as if it had real coverage.
  const dataYears = features.map((f) => f.properties.year);
  const dataMinYear = Math.min(...dataYears);
  const dataMaxYear = Math.max(...dataYears);
  const latestDate = features.map((f) => f.properties.date).filter(Boolean).sort().at(-1);

  // Sanity cross-check (console only — see file header for why
  // PEDESTRIANS_KILLED isn't the field this site treats as "fatal").
  const fatalBySeverity = raw.filter((f) => f.attributes.CRASH_SEVERITY === 'K').length;
  const pedestriansKilled = raw.filter((f) => f.attributes.PEDESTRIANS_KILLED > 0).length;
  if (fatalBySeverity !== pedestriansKilled) {
    console.log(
      `Note: ${fatalBySeverity} crashes are severity=K (fatal, this site's definition) vs ` +
        `${pedestriansKilled} with PEDESTRIANS_KILLED>0 — the ${fatalBySeverity - pedestriansKilled} ` +
        `difference is fatal bicyclist crashes, which PEDESTRIANS_KILLED doesn't count. Expected.`
    );
  }

  console.log('Fetching all-Henrico-crash total for the homepage context stat...');
  const context = await fetchAllCrashContext(features);
  const fatalCount = features.filter((f) => f.properties.sev === 'fatal').length;
  console.log(
    `  ${context.pedBikeCrashes} of ${context.allCrashes} Henrico crashes ` +
      `(${context.years[0]}-${context.years[context.years.length - 1]}) involved someone walking or biking ` +
      `(${((context.pedBikeCrashes / context.allCrashes) * 100).toFixed(1)}%)`
  );
  console.log(
    `  ${fatalCount} of ${features.length} pedestrian/cyclist crashes (${dataMinYear}-${dataMaxYear}) were fatal ` +
      `(${((fatalCount / features.length) * 100).toFixed(1)}%)`
  );

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

  // Emit the year range (+ latest crash date) as a tiny committed module the
  // UI imports synchronously, so filter controls, captions, and the
  // partial-year caveat always match the data — never hardcoded, never able
  // to silently lag behind a refresh. Whether `max` is *possibly* still
  // incomplete is deliberately NOT baked in here as a boolean: the site
  // computes that itself by comparing `max` to the viewer's own current
  // year, so the caveat correctly stops appearing once real time moves past
  // it, with no re-fetch required.
  await writeFile(
    new URL('../src/data/crashYears.json', import.meta.url),
    JSON.stringify({ min: dataMinYear, max: dataMaxYear, latestDate }) + '\n'
  );

  // Homepage lead-stat context (Task 4): committed, not fetched live by the
  // deployed site (this project makes no runtime API calls — everything is
  // fetched at build/script time and shipped static), and recomputed fresh
  // on every re-run of this script rather than typed in once.
  await writeFile(
    new URL('../src/data/crashContext.json', import.meta.url),
    JSON.stringify({
      allCrashesYears: context.years,
      allCrashesTotal: context.allCrashes,
      pedBikeInWindow: context.pedBikeCrashes,
      fatalPedBikeYears: [dataMinYear, dataMaxYear],
      fatalPedBikeCount: fatalCount,
      pedBikeTotal: features.length,
    }) + '\n'
  );

  const mb = json.length / 1024 / 1024;
  console.log(`Wrote ${features.length} crashes (${mb.toFixed(2)} MB) to public/data/crashes.geojson`);
  console.log(
    `Wrote src/data/crashYears.json (${dataMinYear}–${dataMaxYear}, latest crash ${latestDate})`
  );
  console.log('Wrote src/data/crashContext.json (homepage lead-stat figures)');
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
