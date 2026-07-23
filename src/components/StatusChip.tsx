/**
 * Small labeled status chip. The color swatch is never the only signal —
 * the status name is always written out beside it.
 */
import type { ProjectStatus } from '../types'
import { STATUS_LABEL } from '../types'

const STATUS_VAR: Record<ProjectStatus, string> = {
  announced: 'var(--st-announced)',
  design: 'var(--st-design)',
  construction: 'var(--st-construction)',
  complete: 'var(--st-complete)',
}

export default function StatusChip({ status }: { status: ProjectStatus }) {
  return (
    <span className="chip">
      <span
        className="chip__swatch"
        style={{ '--swatch': STATUS_VAR[status] } as React.CSSProperties}
        aria-hidden="true"
      />
      {STATUS_LABEL[status]}
    </span>
  )
}
