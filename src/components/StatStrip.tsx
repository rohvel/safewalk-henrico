/**
 * One-row stat strip: the county's own sidewalk-gap numbers, plus live
 * counts from the data. Numbers count up once on load (≤600ms) unless the
 * visitor prefers reduced motion.
 */
import { useEffect, useRef, useState } from 'react'

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

interface Props {
  projectCount: number
  /** True while every tracked project is still a placeholder example. */
  projectsAllExample: boolean
  crashCount: number
  crashYears: string
  className?: string
}

export default function StatStrip({
  projectCount,
  projectsAllExample,
  crashCount,
  crashYears,
  className,
}: Props) {
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // The 288 / 1,415 figures are Henrico County's own gap statistic:
  // ~288 miles of existing sidewalk against ~1,415 miles of county-maintained road.
  const stats: Stat[] = [
    { id: 'sidewalk', value: 288, label: 'miles of sidewalk' },
    { id: 'road', value: 1415, display: '1,400+', label: 'miles of county road' },
    { id: 'projects', value: projectCount, label: projectsAllExample ? 'example projects' : 'projects tracked' },
    { id: 'crashes', value: crashCount, label: `crashes shown (${crashYears})` },
  ]

  return (
    <div className={`stat-strip ${className ?? ''}`} role="group" aria-label="Key numbers">
      {stats.map((s) => (
        <StatItem key={s.id} stat={s} animate={!reducedMotion} />
      ))}
    </div>
  )
}
