/**
 * The crosswalk stepper — the site's signature element.
 *
 * Four thick stripes on an asphalt-ink strip, read two ways at once:
 * a crosswalk seen from above, and a progress meter. Stripes up to the
 * project's current status are "painted" with the status color; the current
 * stripe carries a sign-yellow edge; stripes ahead stay faint, like
 * unpainted road.
 *
 * Used at three sizes: large on the detail panel (with labels and a one-time
 * fill animation), mini on list rows and in the legend.
 */
import type { ProjectStatus } from '../types'
import { STATUSES, STATUS_LABEL } from '../types'

const STATUS_VAR: Record<ProjectStatus, string> = {
  announced: 'var(--st-announced)',
  design: 'var(--st-design)',
  construction: 'var(--st-construction)',
  complete: 'var(--st-complete)',
}

interface Props {
  status: ProjectStatus
  mini?: boolean
  /** Play the one-time paint animation (detail panel only). */
  animate?: boolean
  /** Show stage labels under the bars (detail panel only). */
  labels?: boolean
}

export default function CrosswalkStepper({ status, mini, animate, labels }: Props) {
  const activeIndex = STATUSES.indexOf(status)
  const classes = ['stepper', mini && 'stepper--mini', animate && 'stepper--animate']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      role="img"
      aria-label={`Status: ${STATUS_LABEL[status]} — step ${activeIndex + 1} of 4`}
    >
      <div className="stepper__track">
        {STATUSES.map((s, i) => {
          const filled = i <= activeIndex
          const active = i === activeIndex
          return (
            <span
              key={s}
              className={[
                'stepper__bar',
                filled && 'stepper__bar--filled',
                active && 'stepper__bar--active',
              ]
                .filter(Boolean)
                .join(' ')}
              style={filled ? ({ '--fill': STATUS_VAR[status] } as React.CSSProperties) : undefined}
            />
          )
        })}
      </div>
      {labels && (
        <div className="stepper__labels" aria-hidden="true">
          {STATUSES.map((s, i) => (
            <span key={s} data-active={i === activeIndex}>
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
