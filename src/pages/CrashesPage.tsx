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
import type { CrashProperties, TimeBand } from '../types'
import type { CrashSeverity, Filters } from '../lib/urlState'
import {
  DEFAULT_FILTERS,
  LATEST_CRASH_DATE,
  LIGHT_CONDITIONS,
  SEVERITIES,
  SEVERITY_LABEL,
  TIME_BANDS,
  TIME_BAND_LABEL,
  YEAR_RANGE,
  isYearPossiblyPartial,
} from '../lib/urlState'
import { formatDate } from '../lib/format'
import { useCrashData, useSchoolData } from '../lib/useGeoData'

/** Neutral phrasing, matching the map popup's voice. */
const MODE_LABEL: Record<CrashProperties['mode'], string> = {
  ped: 'A person walking',
  bike: 'A person biking',
  both: 'People walking and biking',
}

type SortKey = 'year' | 'loc' | 'mode' | 'sev' | 'time' | 'light' | 'control' | 'school' | 'hitrun'
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
      if (c.mode === 'ped' && !wantPed) return false
      if (c.mode === 'bike' && !wantBike) return false
      if (c.mode === 'both' && !wantPed && !wantBike) return false
      if (filters.schoolZoneOnly && !c.schoolZone) return false
      if (filters.hitRunOnly && !c.hitRun) return false
      if (!filters.lights.includes(c.light)) return false
      if (filters.trafficControl !== '' && c.trafficControl !== filters.trafficControl) return false
      if (c.timeBand !== '' && !filters.timeBands.includes(c.timeBand)) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    // blanks always last, regardless of direction
    const compareText = (x: string, y: string) => {
      if (!x && !y) return 0
      if (!x) return 1
      if (!y) return -1
      return x.localeCompare(y) * dir
    }
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'year':
          return (a.year - b.year) * dir
        case 'loc':
          return compareText(a.loc, b.loc)
        case 'mode':
          return MODE_LABEL[a.mode].localeCompare(MODE_LABEL[b.mode]) * dir
        case 'sev':
          return (SEV_ORDER[a.sev] - SEV_ORDER[b.sev]) * dir
        case 'time':
          return compareText(a.time, b.time)
        case 'light':
          return compareText(a.light, b.light)
        case 'control':
          return compareText(a.trafficControl, b.trafficControl)
        case 'school':
          return (Number(a.schoolZone) - Number(b.schoolZone)) * dir
        case 'hitrun':
          return (Number(a.hitRun) - Number(b.hitRun)) * dir
      }
    })
  }, [all, filters, sortKey, sortDir])

  const trafficControlOptions = useMemo(
    () =>
      Array.from(new Set(all.map((c) => c.trafficControl).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [all],
  )

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

  const toggleLight = (l: string) => {
    const has = filters.lights.includes(l)
    const next = has ? filters.lights.filter((x) => x !== l) : [...filters.lights, l]
    onFiltersChange({ ...filters, lights: next.length === 0 ? [...LIGHT_CONDITIONS] : next })
  }

  const toggleTimeBand = (t: TimeBand) => {
    const has = filters.timeBands.includes(t)
    const next = has ? filters.timeBands.filter((x) => x !== t) : [...filters.timeBands, t]
    onFiltersChange({ ...filters, timeBands: next.length === 0 ? [...TIME_BANDS] : next })
  }

  const years = Array.from(
    { length: YEAR_RANGE.max - YEAR_RANGE.min + 1 },
    (_, i) => YEAR_RANGE.min + i,
  )

  const yearCaption =
    (filters.yearMin === filters.yearMax
      ? `${filters.yearMin}`
      : `${filters.yearMin}–${filters.yearMax}`) +
    (isYearPossiblyPartial(filters.yearMax) ? ' (year-to-date)' : '')

  return (
    <main id="main" className="doc doc--wide">
      <h1>Reported crashes</h1>
      <p className="lede">
        Every crash in Henrico County involving a person walking or biking, as recorded by VDOT
        for {YEAR_RANGE.min}–{YEAR_RANGE.max}
        {isYearPossiblyPartial(YEAR_RANGE.max) && (
          <> ({YEAR_RANGE.max} is year-to-date, through {formatDate(LATEST_CRASH_DATE)})</>
        )}
        . This is the same data the <a href="#/">map</a> draws as dots, in a form you can read,
        sort, and search.
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
                  {isYearPossiblyPartial(y) ? `${y} (year-to-date)` : y}
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
                  {isYearPossiblyPartial(y) ? `${y} (year-to-date)` : y}
                </option>
              ))}
            </select>
            {isYearPossiblyPartial(filters.yearMax) && (
              <p className="filter-note">
                {filters.yearMax} is year-to-date, not a full year — data runs through{' '}
                {formatDate(LATEST_CRASH_DATE)}.
              </p>
            )}
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

          <fieldset>
            <legend>Light condition</legend>
            {LIGHT_CONDITIONS.map((l) => (
              <label className="check-row" key={l}>
                <input
                  type="checkbox"
                  checked={filters.lights.includes(l)}
                  onChange={() => toggleLight(l)}
                />
                {l}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Time of day</legend>
            {TIME_BANDS.map((t) => (
              <label className="check-row" key={t}>
                <input
                  type="checkbox"
                  checked={filters.timeBands.includes(t)}
                  onChange={() => toggleTimeBand(t)}
                />
                {TIME_BAND_LABEL[t]}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Traffic control</legend>
            <label htmlFor="crash-traffic-control">Type at crash location</label>{' '}
            <select
              id="crash-traffic-control"
              value={filters.trafficControl}
              onChange={(e) => onFiltersChange({ ...filters, trafficControl: e.target.value })}
            >
              <option value="">All</option>
              {trafficControlOptions.map((tc) => (
                <option key={tc} value={tc}>
                  {tc}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset>
            <legend>Other</legend>
            <label className="check-row">
              <input
                type="checkbox"
                checked={filters.schoolZoneOnly}
                onChange={() =>
                  onFiltersChange({ ...filters, schoolZoneOnly: !filters.schoolZoneOnly })
                }
              />
              School zone crashes only
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={filters.hitRunOnly}
                onChange={() => onFiltersChange({ ...filters, hitRunOnly: !filters.hitRunOnly })}
              />
              Hit &amp; run only
            </label>
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
              recorded no road or no time, the cell reads "Not recorded".
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ['year', 'Year'],
                    ['loc', 'Road'],
                    ['mode', 'People involved'],
                    ['sev', 'Severity'],
                    ['time', 'Time'],
                    ['light', 'Light condition'],
                    ['control', 'Traffic control'],
                    ['school', 'School zone'],
                    ['hitrun', 'Hit & run'],
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
                <tr key={`${c.date}-${c.time}-${c.loc}-${c.mode}-${c.sev}-${i}`}>
                  <td className="num">{c.year}</td>
                  <td>{c.loc || <span className="cell-empty">Not recorded</span>}</td>
                  <td>{MODE_LABEL[c.mode]}</td>
                  <td>{SEVERITY_LABEL[c.sev]}</td>
                  <td className="num">{c.time || <span className="cell-empty">Not recorded</span>}</td>
                  <td>{c.light || <span className="cell-empty">Not recorded</span>}</td>
                  <td>{c.trafficControl || <span className="cell-empty">Not recorded</span>}</td>
                  <td>{c.schoolZone ? 'Yes' : 'No'}</td>
                  <td>{c.hitRun ? 'Yes' : 'No'}</td>
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
