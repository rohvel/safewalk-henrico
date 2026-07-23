# SafeWalk Henrico

SafeWalk Henrico tracks every pedestrian-safety project Henrico County has promised — sidewalks, crosswalks, shared-use paths, signals — and how long each has been waiting. It puts those commitments on one public map, next to where crashes involving people walking and biking have actually happened. The county adopted a goal of cutting roadway deaths and serious injuries by more than half by 2035; this site makes the work toward that goal visible.

> **Disclaimer.** SafeWalk Henrico is an independent student project. Data is compiled from public sources (VDOT, Henrico County documents) and is not official county information. Verify details with Henrico County Public Works before relying on them. Not affiliated with Henrico County, PlanRVA, or VDOT.

## How this differs from existing tools

- **VDOT's statewide project tracker excludes most of Henrico.** Henrico and Arlington are Virginia's only two counties that maintain their own roads — about 1,415 miles in Henrico's case — so state-level trackers structurally miss county pedestrian projects.
- **The county's information exists but is scattered** across CIP budget PDFs and monthly "Word on the Street" district reports, with no interactive tracker. This site assembles those documents into one map.
- **PlanRVA's [Near Miss Dashboard](https://nearmiss.planrva.org/) covers incident reporting** for the region. SafeWalk links to it (see the Tools page) rather than competing with it — we track promises, not incidents.
- **The north star is the county's own goal**: the adopted [Arrive Alive Henrico](https://henrico.gov/works/arrive-alive-henrico/) commitment to cut roadway fatalities and serious injuries by more than half by 2035.

## Running it

Requires **Node.js 18 or newer** (the data scripts use the built-in `fetch`, and Vite 6 needs Node 18+).

```bash
npm install
npm run dev        # local dev server
npm run build      # production build → dist/ (deploy that folder anywhere)
npm run preview    # serve the production build locally
```

No API keys, no accounts, no paid services. The map basemap is OpenFreeMap's Positron style (free for production use; data © OpenStreetMap contributors — keep the attribution control visible).

## Updating the data

### Projects (hand-curated, monthly)

Projects live in [`src/data/projects.json`](src/data/projects.json), typed by [`src/types.ts`](src/types.ts). To add or update a project:

1. Find the commitment in a county document — the CIP budget, a "Word on the Street" district report, or the Arrive Alive plan.
2. Add or edit an entry. Every field is documented in `src/types.ts`. Rules that matter:
   - `sources` is required. A claim without a source doesn't ship.
   - `placeholder` must be `false` only when you have verified the entry against the cited document. Placeholder entries render with an "EXAMPLE" badge everywhere.
   - Geometry is `[lng, lat]` (note the order — longitude first). A single point renders as a marker; an array of points renders as a line. Get coordinates by right-clicking in Google Maps or OpenStreetMap.
   - When a project's status changes, update `status` **and** `dateStatusUpdated`, and consider a line in `src/data/changelog.json`.
3. Run `npm run dev` — the dev console warns about malformed entries (bad dates, missing sources, unknown districts).

The current six entries are **placeholders** ("Example: …", `"placeholder": true`) that exist so every UI state renders. Replace them with verified projects.

### Crash data (scripted, VDOT)

```bash
npm run fetch-crashes
```

This regenerates `public/data/crashes.geojson` from VDOT's public "CrashData basic" layer (the dataset behind the [Virginia Roads open data portal](https://virginiaroads-vdot.opendata.arcgis.com/)): Henrico County only, pedestrian- or bicyclist-involved only, the five most recent full calendar years. The output is committed to the repo, so the site never fetches from VDOT at runtime. Re-run it once or twice a year, or in January when a new full year of data lands. The script verifies the layer's schema before writing and fails loudly if VDOT renames fields — see the field-mapping comment block in [`scripts/fetch-crashes.mjs`](scripts/fetch-crashes.mjs).

If `crashes.geojson` is ever missing, the site falls back to `public/data/crashes.sample.geojson` and shows a permanent "sample data" banner — sample data is never presented as real. That backstop file (~40 clearly synthetic points) is committed; regenerate it with `npm run make-sample` if needed.

### Schools (scripted, Henrico GIS)

```bash
npm run fetch-schools
```

Regenerates `public/data/schools.geojson` (68 school points) from Henrico County's public ArcGIS "Schools Zones and School Locations" service. Rarely needs re-running.

### App icons (scripted, only if you change the mark)

```bash
node scripts/make-icons.mjs
```

The PWA icons (`public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`) are generated from the same crosswalk mark as `public/favicon.svg`, with no image dependencies. Only re-run this if you change the favicon.

## Deploying

The build is fully static — any static host works. Hash routing (`#/about`) means no server-side redirect rules are needed.

### Cloudflare Pages

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, pick the repo.
3. Build settings: framework preset **Vite** (or set build command `npm run build`, output directory `dist`).
4. Deploy. Every push to the default branch redeploys automatically.

### GitHub Pages

1. Push this repo to GitHub.
2. In the repo: **Settings → Pages → Source: GitHub Actions**, and use the suggested "Static HTML" workflow with the build step, or add `.github/workflows/deploy.yml` with the standard Vite→Pages actions (`actions/upload-pages-artifact` on `dist`).
3. If the site is served from `https://<user>.github.io/<repo>/` (a subpath), set `base: './'` in `vite.config.ts` (or `base: '/<repo>/'`) and rebuild — otherwise the build emits root-absolute asset paths (`/assets/…`) that 404 under a `/<repo>/` subpath.

## Project structure

```
scripts/            data-fetch and icon-generation scripts (Node, no build coupling)
public/data/        committed GeoJSON (crashes, schools)
src/data/           projects.json + changelog.json (hand-edited)
src/lib/            hash router, URL filter state, date math, data loaders
src/components/     map, crosswalk stepper, panels, list, detail
src/pages/          home (map), projects, about, tools, changelog, 404
src/styles/         design tokens, base, components (hand-rolled CSS)
```

## Content rules

These are deliberate and non-negotiable for this project:

- **No fabricated data.** Placeholder entries are marked `"placeholder": true` and labeled "EXAMPLE" in the UI. Never invent project names, dates, or costs.
- **No memorial content.** No crash victim's name appears anywhere in the app, code, or copy.
- **Crash data is about people.** Neutral copy, respectful rendering, no playful icons, no gamification.
- **Every project cites its sources.** Document name + link, visible in the UI.

## License

[MIT](LICENSE).
