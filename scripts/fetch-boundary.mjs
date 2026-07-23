/**
 * fetch-boundary.mjs
 * -------------------
 * Downloads the Henrico County, Virginia boundary and writes:
 *   - public/data/henrico-boundary.geojson  (the polygon, for the map outline)
 *   - src/data/henricoBounds.json           (its bounding box, imported
 *     synchronously so the map's INITIAL camera is correct on first paint —
 *     no network wait, no post-load camera jump)
 *
 * Run it with:   npm run fetch-boundary
 *
 * DATA SOURCE (verified 2026-07):
 * US Census Bureau TIGERweb "Counties" layer (authoritative, public, no key).
 * Henrico's own ArcGIS org was checked first and has no standalone county
 * boundary layer; TIGERweb is the reliable fallback the source hierarchy
 * calls for. Queried by STATE='51' (Virginia) AND COUNTY='087' (Henrico) —
 * both confirmed by a separate lookup against TIGERweb's own NAME field
 * before hardcoding the FIPS codes. Server-side generalization
 * (maxAllowableOffset) keeps the file small without a client-side
 * simplification algorithm; geometryPrecision rounds to 5 decimals, matching
 * the crash/school data.
 */

const LAYER_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1';

const OUT_GEOJSON = new URL('../public/data/henrico-boundary.geojson', import.meta.url);
const OUT_BOUNDS = new URL('../src/data/henricoBounds.json', import.meta.url);

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const json = await res.json();
  if (json.error) throw new Error(`Query error: ${JSON.stringify(json.error)}`);
  return json;
}

function boundsOf(geometry) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      coords.forEach(walk);
    }
  };
  walk(geometry.coordinates);
  return { minLng, minLat, maxLng, maxLat };
}

async function main() {
  console.log('Fetching Henrico County boundary from TIGERweb...');
  const params = new URLSearchParams({
    where: "STATE='51' AND COUNTY='087'",
    outFields: 'STATE,COUNTY,NAME,GEOID',
    returnGeometry: 'true',
    geometryPrecision: '5',
    maxAllowableOffset: '0.0008', // ~90m — keeps the file small; still reads as a crisp county line at web-map zooms
    outSR: '4326',
    f: 'geojson',
  });
  const geojson = await getJson(`${LAYER_URL}/query?${params}`);

  if (geojson.features.length !== 1) {
    throw new Error(`Expected exactly 1 county feature, got ${geojson.features.length}`);
  }
  const props = geojson.features[0].properties;
  if (props.NAME !== 'Henrico County' || props.GEOID !== '51087') {
    throw new Error(
      `Fetched feature is not Henrico County (got NAME="${props.NAME}", GEOID="${props.GEOID}"). Refusing to write.`,
    );
  }

  const { writeFile } = await import('node:fs/promises');
  await writeFile(OUT_GEOJSON, JSON.stringify(geojson));

  const bounds = boundsOf(geojson.features[0].geometry);
  await writeFile(OUT_BOUNDS, JSON.stringify(bounds, null, 0) + '\n');

  console.log(`Wrote public/data/henrico-boundary.geojson (${JSON.stringify(geojson).length} bytes)`);
  console.log(
    `Wrote src/data/henricoBounds.json: [${bounds.minLng}, ${bounds.minLat}] to [${bounds.maxLng}, ${bounds.maxLat}]`,
  );
}

main().catch((err) => {
  console.error('\nFetch failed:', err.message);
  process.exit(1);
});
