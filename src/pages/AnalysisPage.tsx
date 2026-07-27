/**
 * Corridor analysis (#/analysis) — the one page on this site that
 * INTERPRETS rather than reports, which is why roughly half of it is
 * caveats and they come before the table rather than after it.
 *
 * The numbers are generated at build time by scripts/analyze-corridors.mjs
 * (see that file's header for the full method and why it was chosen). This
 * component only renders them; it computes no findings of its own.
 *
 * The editorial rules this page exists under:
 *   - crash counts are not risk, and are never labelled as risk
 *   - nothing is scored, indexed, or called "most dangerous"
 *   - "no tracked project" never implies the county did nothing
 *   - the matching rule is stated in the open, next to the results
 */
import { useMemo } from 'react'
import corridors from '../data/corridors.json'
import type { Filters } from '../lib/urlState'
import { DEFAULT_FILTERS } from '../lib/urlState'
import { buildHash } from '../lib/router'

type Segment = (typeof corridors.segments)[number]
type SortKey = 'label' | 'crashes' | 'fatal' | 'length' | 'project'

const COLUMNS: [SortKey, string][] = [
  ['label', 'Corridor'],
  ['crashes', 'Recorded crashes'],
  ['fatal', 'Of those, fatal'],
  ['length', 'Stretch'],
  ['project', 'Tracked project within 100 m'],
]

const MILES = 1609.344

/** What a row is called: the OSM street name where we could resolve one, with
 *  VDOT's route code kept alongside so the two can be reconciled. */
function labelOf(s: Segment): string {
  return s.streetName ? `${s.streetName} (${s.corridor})` : s.corridor
}

interface Props {
  filters: Filters
  onFiltersChange: (f: Filters) => void
}

export default function AnalysisPage({ filters, onFiltersChange }: Props) {
  const t = corridors.totals
  const m = corridors.method

  const sortKey = (COLUMNS.some(([k]) => k === filters.analysisSort)
    ? filters.analysisSort
    : 'crashes') as SortKey
  const sortDir = filters.analysisDir

  const rows = useMemo(() => {
    const q = filters.analysisQuery.trim().toLowerCase()
    let out = (corridors.segments as Segment[]).filter((s) => {
      if (filters.analysisNoProjectOnly && s.matchedProjects.length > 0) return false
      if (!q) return true
      return labelOf(s).toLowerCase().includes(q)
    })
    const dir = sortDir === 'asc' ? 1 : -1
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case 'label':
          return labelOf(a).localeCompare(labelOf(b)) * dir
        case 'fatal':
          return (a.fatal - b.fatal) * dir || b.crashes - a.crashes
        case 'length':
          return (a.spreadMetres - b.spreadMetres) * dir
        case 'project': {
          // Sort by distance to the nearest project; unmatched sort last.
          const av = a.nearestProjectMetres ?? Number.MAX_SAFE_INTEGER
          const bv = b.nearestProjectMetres ?? Number.MAX_SAFE_INTEGER
          return (av - bv) * dir
        }
        default:
          return (a.crashes - b.crashes) * dir || b.fatal - a.fatal
      }
    })
    return out
  }, [filters.analysisQuery, filters.analysisNoProjectOnly, sortKey, sortDir])

  const toggleSort = (key: SortKey) =>
    onFiltersChange({
      ...filters,
      analysisSort: key,
      analysisDir: key === sortKey && sortDir === 'desc' ? 'asc' : 'desc',
    })

  const ariaSort = (key: SortKey): 'ascending' | 'descending' | 'none' =>
    sortKey !== key ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending'

  const matchedCount = (corridors.segments as Segment[]).filter(
    (s) => s.matchedProjects.length > 0,
  ).length

  return (
    <main id="main" className="doc">
      <h1>Where crashes were recorded, and where projects are</h1>
      <p className="lede">
        This site holds two things nobody else has side by side: every reported crash in Henrico
        involving someone walking or biking, and every pedestrian-safety project the county named
        in its own newsletters — both placed on a map. This page puts them against each other and
        asks a single question: <strong>which stretches of road have recorded the most crashes,
        and which of those have no project this site knows about?</strong>
      </p>

      <section className="callout callout--warn">
        <h2>Read this before the table</h2>
        <ul>
          <li>
            <strong>A crash count is not a danger rating.</strong> Measuring risk needs to know how
            many people actually walk somewhere, and no such count exists for Henrico. A busy
            commercial road records more crashes partly because far more people are walking on it.
            These rows are ordered by <em>recorded crash count</em> and nothing else.
          </li>
          <li>
            <strong>"No tracked project" does not mean the county did nothing.</strong> This site
            knows about {t.projects} projects, read out of six 2024 newsletters. The county's real
            programme is larger. A stretch with no match here may well have work planned that this
            site has never seen — the honest reading is "this site has no record of a project
            here", not "there is no project here".
          </li>
          <li>
            <strong>{t.projectsWithoutLocation} of the {t.projects} projects have no mapped
            location at all</strong>, so they cannot match any stretch of road, however close they
            really are.
          </li>
          <li>
            <strong>The two datasets do not cover the same period.</strong> Crash records run{' '}
            {t.crashYearMin}–{t.crashYearMax}; project statuses reflect county publications
            through September 2024.
          </li>
          <li>
            <strong>{t.crashesWithoutRoadName} of {t.crashes} crashes</strong> have no road
            recorded by VDOT and are absent from every row below.
          </li>
        </ul>
      </section>

      <section>
        <h2>How these rows were built</h2>
        <ol className="method-list">
          <li>
            <strong>Group by road.</strong> Each crash carries VDOT's own route name.{' '}
            {t.crashesWithRoadName} of {t.crashes} records have one. Travel directions are merged,
            so "US 250 EB" and "US 250 WB" are one road. Directional <em>prefixes</em> are not
            merged — E and S Laburnum Avenue are different stretches, not two sides of one.
          </li>
          <li>
            <strong>Cut into stretches.</strong> A road on its own is too blunt: US 250 runs about
            nine miles across Henrico, from city-line arterial to Short Pump highway, and one
            answer for all of it would mean nothing. So each road is cut wherever there is a gap of
            more than <strong>{m.segmentGapMetres} m</strong> between neighbouring crashes on it.
            The road provides the line; the gap decides where one stretch ends and the next begins.
          </li>
          <li>
            <strong>Match projects by distance.</strong> A project counts as being on a stretch when
            any part of it lies within <strong>{m.matchRadiusMetres} m</strong> — roughly a city
            block — of at least one crash on that stretch. The exact distance to the nearest project
            is shown in every row, so you can apply a stricter or looser rule than ours.
          </li>
          <li>
            <strong>Only stretches with {m.minCrashes} or more crashes are listed</strong>, because
            below that the counts are too small to order against each other meaningfully. That
            leaves {t.segmentsPublished} stretches holding {t.crashesInPublishedSegments} of the{' '}
            {t.crashesWithRoadName} placed crashes; the remainder are spread thinly across{' '}
            {t.segmentsAll - t.segmentsPublished} smaller groupings.
          </li>
          <li>
            <strong>Street names come from OpenStreetMap</strong>, looked up at each stretch's own
            midpoint, because a route code maps to different street names along its length. VDOT's
            code is kept in brackets so the two can always be reconciled.
          </li>
        </ol>
        <p className="filter-note">
          Generated {corridors.generated} by <code>npm run analyze-corridors</code>, from the same
          committed data the map and the crash table use. Nothing here is computed in your browser.
        </p>
      </section>

      <h2>Stretches of road, by recorded crash count</h2>

      <section className="callout callout--warn">
        <h2>Before you read the last column: check the denominator</h2>
        <p>
          {matchedCount} of the {corridors.segments.length} stretches below have a tracked project
          within {m.matchRadiusMetres} m. That number looks stark, and it is the easiest thing on
          this page to misread.
        </p>
        <p>
          It is mostly a statement about <em>how little project data this site has</em>, not about
          what the county has built. There are {t.projectsWithLocation} locatable projects here,
          spread across a county of some 245 square miles, against {corridors.segments.length}{' '}
          stretches of road. Two sets that sparse would overlap rarely even if the county were
          working precisely where crashes cluster. A low overlap is close to what you should expect
          from these inputs, and it is <strong>not</strong> evidence of neglect.
        </p>
        <p>
          What the column does support is narrower and still worth something: for these specific
          stretches, <em>this site holds no record of a project</em>. That is a question to put to
          Public Works, not an answer.
        </p>
      </section>

      <div className="controls__section" style={{ border: 0, padding: 0 }}>
        <div className="list-filter" style={{ padding: 0, border: 0 }}>
          <label className="list-filter__label" htmlFor="analysis-filter">
            Filter by road name
          </label>
          <div className="list-filter__row">
            <input
              id="analysis-filter"
              type="text"
              className="list-filter__input"
              value={filters.analysisQuery}
              onChange={(e) => onFiltersChange({ ...filters, analysisQuery: e.target.value })}
              placeholder="e.g. Broad, Laburnum"
              autoComplete="off"
            />
            {filters.analysisQuery !== '' && (
              <button
                type="button"
                className="btn btn--small"
                onClick={() => onFiltersChange({ ...filters, analysisQuery: '' })}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <label className="check-row" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={filters.analysisNoProjectOnly}
            onChange={() =>
              onFiltersChange({ ...filters, analysisNoProjectOnly: !filters.analysisNoProjectOnly })
            }
          />
          Only stretches with no tracked project within {m.matchRadiusMetres} m
        </label>
      </div>

      <p className="table-summary" role="status">
        Showing <strong>{rows.length}</strong> of {corridors.segments.length} stretches.
        {rows.length === 0 && ' No stretches match these filters.'}
      </p>

      {rows.length === 0 ? (
        <p>
          <button
            type="button"
            className="btn"
            onClick={() =>
              onFiltersChange({
                ...filters,
                analysisQuery: DEFAULT_FILTERS.analysisQuery,
                analysisNoProjectOnly: DEFAULT_FILTERS.analysisNoProjectOnly,
              })
            }
          >
            Clear filters
          </button>
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <caption>
              Stretches of road in Henrico with {m.minCrashes} or more recorded crashes involving
              someone walking or biking, {t.crashYearMin}–{t.crashYearMax}, ordered by recorded
              crash count. "Tracked project" means a project this site knows about lies within{' '}
              {m.matchRadiusMetres} m of at least one crash on the stretch — it is not a statement
              about what the county has planned. Sortable by any column.
            </caption>
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th key={key} scope="col" aria-sort={ariaSort(key)}>
                    <button type="button" className="th-sort" onClick={() => toggleSort(key)}>
                      {label}
                      <span className="th-sort__icon" aria-hidden="true">
                        {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
                <th scope="col">Links</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const matched = s.matchedProjects
                return (
                  <tr key={`${s.corridor}-${s.centre[0]}-${s.centre[1]}`}>
                    <th scope="row" className="cell-label">
                      {labelOf(s)}
                    </th>
                    <td className="num">{s.crashes}</td>
                    <td className="num">{s.fatal}</td>
                    <td className="num">{(s.spreadMetres / MILES).toFixed(1)} mi</td>
                    <td>
                      {matched.length > 0 ? (
                        <ul className="cell-list">
                          {matched.map((p) => (
                            <li key={p.id}>
                              <a href={`#/project/${p.id}`}>{p.name}</a>{' '}
                              <span className="cell-muted">({p.metres} m)</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span>
                          <strong>None</strong>
                          {s.nearestProjectMetres !== null && (
                            <span className="cell-muted">
                              {' '}
                              — nearest is{' '}
                              <a href={`#/project/${s.nearestProjectId}`}>{s.nearestProjectName}</a>
                              , {(s.nearestProjectMetres / MILES).toFixed(2)} mi away
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="cell-actions">
                      <a href={buildHash('/crashes', new URLSearchParams({ road: s.corridor }))}>
                        Crashes on {s.corridor}
                      </a>
                      <a href={buildHash('/', new URLSearchParams({ focus: s.bbox.join(',') }))}>
                        Show on map
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <section>
        <h2>What this cannot tell you</h2>
        <p>
          Whether a stretch is dangerous. Whether the county is aware of it. Whether a project that
          does exist is the right one, or big enough. Crash records describe reported collisions
          after the fact; they say nothing about near misses, and nothing about the people who
          simply do not walk somewhere because it feels unsafe — the clearest signal of all, and
          the one no dataset here contains.
        </p>
        <p>
          The "Crashes on ..." link opens the crash table filtered to the whole road, not to the
          individual stretch — the table has no spatial filter, so it will show more crashes than
          the row counts.
        </p>
        <p>
          <a href="#/about">How this site counts things, and where the data comes from →</a>
        </p>
      </section>
    </main>
  )
}
