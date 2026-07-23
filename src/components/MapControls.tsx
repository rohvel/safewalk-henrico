/**
 * Layer toggles, filters, and the legend. Every change writes straight to
 * the URL hash (via the parent), so any filtered view is shareable.
 */
import type { Filters } from '../lib/urlState'
import { YEAR_RANGE } from '../lib/urlState'
import type { District, ProjectStatus } from '../types'
import { DISTRICTS, STATUSES, STATUS_LABEL } from '../types'
import CrosswalkStepper from './CrosswalkStepper'

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
}

const YEARS = Array.from(
  { length: YEAR_RANGE.max - YEAR_RANGE.min + 1 },
  (_, i) => YEAR_RANGE.min + i,
)

export default function MapControls({ filters, onChange }: Props) {
  const toggleLayer = (key: keyof Filters['layers']) =>
    onChange({ ...filters, layers: { ...filters.layers, [key]: !filters.layers[key] } })

  const toggleDistrict = (d: District) => {
    const has = filters.districts.includes(d)
    const next = has ? filters.districts.filter((x) => x !== d) : [...filters.districts, d]
    // Zero districts selected would mean an empty map with no hint why —
    // treat "none" as "all" instead.
    onChange({ ...filters, districts: next.length === 0 ? [...DISTRICTS] : next })
  }

  const toggleStatus = (s: ProjectStatus) => {
    const has = filters.statuses.includes(s)
    const next = has ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s]
    onChange({ ...filters, statuses: next.length === 0 ? [...STATUSES] : next })
  }

  const toggleMode = (m: 'ped' | 'bike') => {
    const has = filters.modes.includes(m)
    const next = has ? filters.modes.filter((x) => x !== m) : [...filters.modes, m]
    onChange({ ...filters, modes: next.length === 0 ? (['ped', 'bike'] as const).slice() : next })
  }

  return (
    <>
      <div className="controls__section">
        <h2 className="controls__heading">Layers</h2>
        {(
          [
            ['projects', 'Projects'],
            ['crashes', 'Crashes'],
            ['schools', 'Schools'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="check-row">
            <input
              type="checkbox"
              checked={filters.layers[key]}
              onChange={() => toggleLayer(key)}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="controls__section">
        <h2 className="controls__heading">District</h2>
        {DISTRICTS.map((d) => (
          <label key={d} className="check-row">
            <input
              type="checkbox"
              checked={filters.districts.includes(d)}
              onChange={() => toggleDistrict(d)}
            />
            {d}
          </label>
        ))}
      </div>

      <div className="controls__section">
        <h2 className="controls__heading">Project status</h2>
        {STATUSES.map((s) => (
          <label key={s} className="check-row">
            <input
              type="checkbox"
              checked={filters.statuses.includes(s)}
              onChange={() => toggleStatus(s)}
            />
            {STATUS_LABEL[s]}
          </label>
        ))}
      </div>

      <div className="controls__section">
        <h2 className="controls__heading">Crashes</h2>
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
        <div className="year-range">
          <label htmlFor="year-min">From</label>
          <select
            id="year-min"
            aria-label="Crashes from year"
            value={filters.yearMin}
            onChange={(e) =>
              onChange({
                ...filters,
                yearMin: Number(e.target.value),
                yearMax: Math.max(Number(e.target.value), filters.yearMax),
              })
            }
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <label htmlFor="year-max">to</label>
          <select
            id="year-max"
            aria-label="Crashes to year"
            value={filters.yearMax}
            onChange={(e) =>
              onChange({
                ...filters,
                yearMax: Number(e.target.value),
                yearMin: Math.min(Number(e.target.value), filters.yearMin),
              })
            }
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="controls__section">
        <h2 className="controls__heading">Legend</h2>
        <div className="legend__item">
          <span className="legend__glyph legend__glyph--wide">
            <CrosswalkStepper status="design" mini />
          </span>
          <span>Project — the crossing paints in stripe by stripe as it advances</span>
        </div>
        {STATUSES.map((s) => (
          <div className="legend__item" key={s}>
            <span className="legend__glyph">
              <span
                className="chip__swatch"
                style={{ '--swatch': `var(--st-${s})` } as React.CSSProperties}
              />
            </span>
            <span>{STATUS_LABEL[s]}</span>
          </div>
        ))}
        <div className="legend__item">
          <span className="legend__glyph legend__glyph--wide">
            <span className="legend-line legend-line--example" />
            <span className="legend-dot legend-dot--example" />
          </span>
          <span>Example project (dashed / hollow) — not yet verified</span>
        </div>
        <div className="legend__item">
          <span className="legend__glyph">
            <span className="dot-ped" />
          </span>
          <span>Crash — person walking</span>
        </div>
        <div className="legend__item">
          <span className="legend__glyph">
            <span className="dot-bike" />
          </span>
          <span>Crash — person biking</span>
        </div>
        <div className="legend__item">
          <span className="legend__glyph">
            <span className="dot-fatal" />
          </span>
          <span>Fatal crash</span>
        </div>
        <div className="legend__item">
          <span className="legend__glyph">
            <span className="glyph-school" />
          </span>
          <span>School</span>
        </div>
        <p className="legend__report">
          Almost got hit? <a href="#/tools">Report it →</a>
        </p>
      </div>
    </>
  )
}
