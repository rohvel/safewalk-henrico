/**
 * The goal banner — the site's thesis, stated in the county's own words.
 *
 * Henrico's Board of Supervisors adopted (Dec 3, 2024, reaffirmed in the
 * July 2025 Arrive Alive Henrico Safety Action Plan) a commitment to reduce
 * roadway fatalities and serious injuries by more than 50% by 2035. This
 * site tracks the pedestrian-safety projects meant to get there.
 *
 * Dismissed state lives in the URL hash (goal=off), not storage — a shared
 * link shows exactly what the sharer saw.
 */
import type { Filters } from '../lib/urlState'

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
}

export default function GoalBanner({ filters, onChange }: Props) {
  if (filters.goalDismissed) return null

  return (
    <div className="goal-banner" role="region" aria-label="Henrico's adopted safety goal">
      <p>
        Henrico's{' '}
        <a
          href="https://henrico.gov/works/arrive-alive-henrico/"
          target="_blank"
          rel="noopener noreferrer"
        >
          adopted goal
        </a>
        : cut roadway deaths and serious injuries by more than half by 2035. This site tracks the
        pedestrian-safety projects meant to get there.
      </p>
      <button
        type="button"
        className="goal-banner__dismiss"
        aria-label="Dismiss goal banner"
        onClick={() => onChange({ ...filters, goalDismissed: true })}
      >
        ×
      </button>
    </div>
  )
}
