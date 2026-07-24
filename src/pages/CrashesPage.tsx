/**
 * Reported crashes as a real HTML table — the accessible equivalent of the
 * map's crash layer.
 *
 * The map draws crashes as canvas pixels, which are unreachable by keyboard
 * and invisible to screen readers on every platform. This page carries the
 * same data in semantic HTML, so the crash layer has a genuine non-canvas
 * representation (WCAG 2.1.1 / 1.1.1), and so that anyone — mouse user
 * included — can actually answer questions like "how many bike crashes in
 * 2024", which a field of dots cannot.
 *
 * Filter state lives in the URL hash, shared with the map, so year and mode
 * survive moving between the two views.
 */
import { useMemo, useState } from 'react'
import type { CrashProperties } from '../types'
import type { CrashSeverity, Filters } from '../lib/urlState'
import { DEFAULT_FILTERS, SEVERITIES, SEVERITY_LABEL, YEAR_RANGE } from '../lib/urlState'
import { useCrashData, useSchoolData } from '../lib/useGeoData'

/** Neutral phrasing, matching the map popup's voice. */
const MODE_LABEL: Record<CrashProperties['mode'], string> = {
  ped: 'A person walking',
  bike: 'A person biking',
  both: 'People walking and biking',
}

type SortKey = 'year' | 'loc' | 'mode' | 'sev'
type SortDir = 'asc' | 'desc'

/** Severity ordered by seriousness so sorting is meaningful, not alphabetical. */
const SEV_ORDER: Record<CrashSeverity, number> = { fatal: 0, injury: 1, other: 2 }

interface Props {
  filters: Filters
  onFiltersChange: (f: Filters) => void
}

export default function CrashesPage({ filters, onFiltersChange }: Props) {
  const crash = useCrashData()
  const schools = useSchoolData()
  const [sortKey, setSortKey] = useState<SortKey>('year')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const all = useMemo<CrashProperties[]>(
    () =>
      (crash.collection?.features ?? []).map((f) => f.properties as unknown as CrashProperties),
    [crash.collection],
  )

  const rows = useMemo(() => {
    const filtered = all.filter((c) => {
      if (c.year < filters.yearMin || c.year > filters.yearMax) return false
      if (!filters.severities.includes(c.sev)) return false
      const wantPed = filters.modes.includes('ped')
      const wantBike = filters.modes.includes('bike')
      if (c.mode === 'ped') return wantPed
      if (c.mode === 'bike') return wantBike
      return wantPed || wantBike // 'both'
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'year':
          return (a.year - b.year) * dir
        case 'loc':
          // blanks always last, regardless of direction
          if (!a.loc && !b.loc) return 0
          if (!a.loc) return 1
          if (!b.loc) return -1
          return a.loc.localeCompare(b.loc) * dir
        case 'mode':
          return MODE_LABEL[a.mode].localeCompare(MODE_LABEL[b.mode]) * dir
        case 'sev':
          return (SEV_ORDER[a.sev] - SEV_ORDER[b.sev]) * dir
      }
    })
  }, [all, filters, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'year' ? 'desc' : 'asc')
    }
  }

  const ariaSort = (key: SortKey): 'ascending' | 'descending' | 'none' =>
    sortKey !== key ? 'none' : sortDir === 'asc' ? 'ascending' : 'descending'

  const toggleMode = (m: 'ped' | 'bike') => {
    const has = filters.modes.includes(m)
    const next = has ? filters.modes.filter((x) => x !== m) : [...filters.modes, m]
    onFiltersChange({ ...filters, modes: next.length === 0 ? ['ped', 'bike'] : next })
  }

  const toggleSeverity = (s: CrashSeverity) => {
    const has = filters.severities.includes(s)
    const next = has ? filters.severities.filter((x) => x !== s) : [...filters.severities, s]
    onFiltersChange({ ...filters, severities: next.length === 0 ? [...SEVERITIES] : next })
  }

  const years = Array.from(
    { length: YEAR_RANGE.max - YEAR_RANGE.min + 1 },
    (_, i) => YEAR_RANGE.min + i,
  )

  const yearCaption =
    filters.yearMin === filters.yearMax
      ? `${filters.yearMin}`
      : `${filters.yearMin}–${filters.yearMax}`

  return (
    <main id="main" className="doc doc--wide">
      <h1>Reported crashes</h1>
      <p className="lede">
        Every crash in Henrico County involving a person walking or biking, as recorded by VDOT
        for {YEAR_RANGE.min}–{YEAR_RANGE.max}. This is the same data the{' '}
        <a href="#/">map</a> draws as dots, in a form you can read, sort, and search.
      </p>

      {crash.isSample && (
        <p className="disclaimer" role="alert">
          Showing <strong>sample crash data</strong> — not real crashes. Run{' '}
          <code>npm run fetch-crashes</code> for real VDOT data.
        </p>
      )}

      <section aria-labelledby="crash-filters-heading">
        <h2 id="crash-filters-heading" className="controls__heading">
          Filters
        </h2>
        <div className="table-filters">
          <fieldset>
            <legend>Years</legend>
            <label htmlFor="crash-year-min">From</label>{' '}
            <select
              id="crash-year-min"
              value={filters.yearMin}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  yearMin: Number(e.target.value),
                  yearMax: Math.max(Number(e.target.value), filters.yearMax),
                })
              }
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>{' '}
            <label htmlFor="crash-year-max">to</label>{' '}
            <select
              id="crash-year-max"
              value={filters.yearMax}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  yearMax: Number(e.target.value),
                  yearMin: Math.min(Number(e.target.value), filters.yearMin),
                })
              }
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset>
            <legend>People involved</legend>
            <label className="check-row">
              <input
                type="checkbox"
                checked={filters.modes.includes('ped')}
                onChange={() => toggleMode('ped')}
              />
              People walking
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={filters.modes.includes('bike')}
                onChange={() => toggleMode('bike')}
              />
              People biking
            </label>
          </fieldset>

          <fieldset>
            <legend>Severity</legend>
            {SEVERITIES.map((s) => (
              <label className="check-row" key={s}>
                <input
                  type="checkbox"
                  checked={filters.severities.includes(s)}
                  onChange={() => toggleSeverity(s)}
                />
                {SEVERITY_LABEL[s]}
              </label>
            ))}
          </fieldset>
        </div>
      </section>

      <p className="table-summary" role="status">
        Showing <strong>{rows.length.toLocaleString('en-US')}</strong> of{' '}
        {all.length.toLocaleString('en-US')} reported crashes, {yearCaption}.
        {rows.length === 0 && ' No crashes match these filters.'}
      </p>

      {rows.length === 0 ? (
        <p>
          <button
            type="button"
            className="btn"
            onClick={() =>
              onFiltersChange({
                ...DEFAULT_FILTERS,
                goalDismissed: filters.goalDismissed,
                listOpen: filters.listOpen,
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
              Crashes involving a person walking or biking in Henrico County, {yearCaption}.
              Sortable by any column. Road name comes from VDOT's route records; where VDOT
              recorded no road, the cell reads "Not recorded".
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ['year', 'Year'],
                    ['loc', 'Road'],
                    ['mode', 'People involved'],
                    ['sev', 'Severity'],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} scope="col" aria-sort={ariaSort(key)}>
                    <button type="button" className="th-sort" onClick={() => toggleSort(key)}>
                      {label}
                      <span className="th-sort__icon" aria-hidden="true">
                        {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={`${c.year}-${c.loc}-${c.mode}-${c.sev}-${i}`}>
                  <td className="num">{c.year}</td>
                  <td>{c.loc || <span className="cell-empty">Not recorded</span>}</td>
                  <td>{MODE_LABEL[c.mode]}</td>
                  <td>{SEVERITY_LABEL[c.sev]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section>
        <h2>School locations</h2>
        <p>
          The map also shows Henrico County public schools, for context on where people walk to
          school. That layer is listed here for the same reason this page exists.
        </p>
        {schools ? (
          <ul className="school-list">
            {[...schools.features]
              .map((f) => String(f.properties?.name ?? ''))
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b))
              .map((name) => (
                <li key={name}>{name}</li>
              ))}
          </ul>
        ) : (
          <p>Loading school locations…</p>
        )}
      </section>

      <section>
        <h2>About this data</h2>
        <p>
          Crash records come from VDOT's public crash dataset, filtered to Henrico County and to
          crashes involving a person walking or biking. Severity follows the reporting scale used
          in the source: a fatal crash, a crash with at least one injury, or a crash where no
          injuries were recorded.
        </p>
        <p>
          Road names are taken from VDOT's own route records. They are not looked up from
          coordinates, so no road name here is approximated — where the source records no road,
          the table says so. Locations are reported to the road, not the exact address.
        </p>
        <p>
          <a href="#/about">More about sources and methodology</a>
        </p>
      </section>
    </main>
  )
}
