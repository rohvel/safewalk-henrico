/**
 * One-row stat strip: live counts from the data, plus a quiet supporting
 * sentence putting the crash numbers in context. Numbers count up once on
 * load (≤600ms) unless the visitor prefers reduced motion.
 */
import { forwardRef, useEffect, useRef, useState } from 'react'

interface Stat {
  /** Stable identity for React's key — must NOT depend on the label text,
   *  or a label change (e.g. the year range) would remount and re-animate. */
  id: string
  value: number
  /** Rendered instead of the plain number once counting finishes. */
  display?: string
  label: string
}

function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target)
  const done = useRef(false)

  useEffect(() => {
    if (!enabled || done.current || target === 0) {
      setValue(target)
      return
    }
    done.current = true
    const t0 = performance.now()
    const duration = 550
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - (1 - p) * (1 - p) // ease-out
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, enabled])

  return value
}

function StatItem({ stat, animate }: { stat: Stat; animate: boolean }) {
  const n = useCountUp(stat.value, animate)
  const settled = n === stat.value
  return (
    <div className="stat">
      <span className="stat__num">{settled && stat.display ? stat.display : n.toLocaleString('en-US')}</span>
      <span className="stat__label">{stat.label}</span>
    </div>
  )
}

/** The two Task-4 figures, already computed (see HomePage.tsx) — this
 *  component only formats and renders them. */
export interface CrashContextFigures {
  pedBikeShare: { count: number; total: number; years: string; pct: number }
  fatalShare: { count: number; total: number; years: string; pct: number }
}

interface Props {
  projectCount: number
  /** True while every tracked project is still a placeholder example. */
  projectsAllExample: boolean
  crashCount: number
  crashYears: string
  context: CrashContextFigures | null
  className?: string
}

const StatStrip = forwardRef<HTMLDivElement, Props>(function StatStrip(
  { projectCount, projectsAllExample, crashCount, crashYears, context, className },
  ref,
) {
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // The infrastructure-gap pair this whole site exists to close the
  // distance on — restored 2026-07-25 after being dropped when the
  // crash-context paragraph below was added; without it the homepage read as
  // a crash map instead of a promise tracker. Sourced independently, not
  // from memory:
  //   sidewalk: Henrico's own "Walk" page (henrico.gov/works/transportation/
  //   walk/, undated) states "over 260 miles of sidewalk" — rendered as
  //   "260+" rather than a false-precision exact number, since the source
  //   itself doesn't give one. (A May 2026 news quote from the Public Works
  //   director cites 288 instead; flagged to the user rather than silently
  //   picked — the more conservative, directly-sourced figure ships here.)
  //   road: VDOT's own highways page (vdot.virginia.gov/about/our-system/
  //   highways/) states plainly "Henrico County (1,415 miles) ... maintain
  //   their own roads with VDOT funds."
  const stats: Stat[] = [
    { id: 'sidewalk', value: 260, display: '260+', label: 'miles of sidewalk' },
    { id: 'road', value: 1415, display: '1,400+', label: 'miles of county road' },
    { id: 'projects', value: projectCount, label: projectsAllExample ? 'example projects' : 'projects tracked' },
    { id: 'crashes', value: crashCount, label: `crashes shown (${crashYears})` },
  ]

  return (
    <div ref={ref} className={`stat-strip ${className ?? ''}`} role="group" aria-label="Key numbers">
      <div className="stat-strip__tiles">
        {stats.map((s) => (
          <StatItem key={s.id} stat={s} animate={!reducedMotion} />
        ))}
      </div>
      {context && (
        <p className="stat-strip__context">
          Henrico logged <strong>{context.pedBikeShare.total.toLocaleString('en-US')}</strong>{' '}
          reported crashes in {context.pedBikeShare.years}; <strong>{context.pedBikeShare.count}</strong>{' '}
          ({context.pedBikeShare.pct}%) involved someone walking or biking. Of the{' '}
          <strong>{context.fatalShare.total}</strong> pedestrian/cyclist crashes recorded{' '}
          {context.fatalShare.years}, <strong>{context.fatalShare.count}</strong> were fatal crashes
          — about one in ten. <a href="#/about">How we count that →</a>
        </p>
      )}
    </div>
  )
})

export default StatStrip
