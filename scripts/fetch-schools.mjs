/**
 * fetch-schools.mjs
 * -----------------
 * Downloads Henrico County public school locations from the county's own
 * ArcGIS service and writes public/data/schools.geojson (committed to the
 * repo, so the site works without re-running this).
 *
 * Run it with:   npm run fetch-schools    (or: node scripts/fetch-schools.mjs)
 *
 * DATA SOURCE (verified 2026-07):
 * "Schools Zones and School Locations" service in Henrico County's ArcGIS
 * organization. Layer 0 is a point layer of all HCPS schools.
 * Fields we use:
 *   LABEL   string  full display name, e.g. "Shady Grove Elementary School"
 *   LEVEL_  string  "Elementary" | "Middle" | "High" (note trailing underscore)
 */

const LAYER_URL =
  'https://services.arcgis.com/LxWK4CxNTBBlLshT/arcgis/rest/services/Schools_zones/FeatureServer/0';

const OUT_FILE = new URL('../public/data/schools.geojson', import.meta.url);

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const json = await res.json();
  if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error)}`);
  return json;
}

function round5(n) {
  return Math.round(n * 1e5) / 1e5;
}

async function main() {
  console.log('Fetching Henrico school locations...');
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'LABEL,LEVEL_',
    outSR: '4326',
    f: 'json',
  });
  const data = await getJson(`${LAYER_URL}/query?${params}`);

  const features = (data.features ?? [])
    .filter((f) => f.geometry && Number.isFinite(f.geometry.x) && Number.isFinite(f.geometry.y))
    .map((f) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [round5(f.geometry.x), round5(f.geometry.y)],
      },
      properties: {
        name: f.attributes.LABEL ?? 'School',
        level: f.attributes.LEVEL_ ?? '',
      },
    }));

  if (features.length === 0) throw new Error('Layer returned zero schools — check the URL.');

  const collection = {
    type: 'FeatureCollection',
    properties: {
      source: 'Henrico County GIS — Schools Zones and School Locations',
      fetched: new Date().toISOString().slice(0, 10),
    },
    features,
  };

  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(collection));
  console.log(`Wrote ${features.length} schools to public/data/schools.geojson`);
}

main().catch((err) => {
  console.error('\nFetch failed:', err.message);
  process.exit(1);
});
