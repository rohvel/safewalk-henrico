/**
 * Project detail: the crosswalk stepper at full size, the day counters in
 * large tabular mono, sources (every claim cites its document), and a copy-
 * link button. Rendered as a slide-over panel on desktop and a full bottom
 * sheet on mobile; works identically when the map is unavailable.
 */
import { useEffect, useRef, useState } from 'react'
import type { Project } from '../types'
import { STATUS_LABEL, TYPE_LABEL } from '../types'
import { daysSince, formatDate } from '../lib/format'
import CrosswalkStepper from './CrosswalkStepper'
import StatusChip from './StatusChip'
import ExampleBadge from './ExampleBadge'

interface Props {
  project: Project
  onClose: () => void
}

export default function ProjectDetail({ project: p, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  // Reset the copy confirmation when switching projects.
  useEffect(() => setCopied(false), [p.id])

  // Opening the panel moves focus into it, so keyboard and screen-reader
  // users land on the new content instead of being dropped to <body> when
  // the drawer/list that held focus unmounts.
  useEffect(() => {
    panelRef.current?.focus()
  }, [p.id])

  // Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const days = daysSince(p.dateAnnounced)
  const daysStatus = daysSince(p.dateStatusUpdated)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the URL bar still has the link.
    }
  }

  return (
    <section className="detail" aria-label={`Project: ${p.name}`} tabIndex={-1} ref={panelRef}>
      <div className="detail__topbar">
        <button type="button" className="btn btn--small" onClick={onClose}>
          ← Back to map
        </button>
        <span className="spacer" style={{ marginLeft: 'auto' }} />
        <button type="button" className="btn btn--small" onClick={copyLink}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </div>

      <div className="detail__body">
        {p.placeholder && (
          <p style={{ marginBottom: 8 }}>
            <ExampleBadge long />
          </p>
        )}
        <h2 className="detail__title">{p.name}</h2>
        <div className="detail__meta">
          <span className="chip chip--quiet">{p.district} District</span>
          <span className="chip chip--quiet">{TYPE_LABEL[p.type]}</span>
          <StatusChip status={p.status} />
        </div>

        <CrosswalkStepper status={p.status} animate labels />

        <div className="day-counter">
          <span className="num">{days.toLocaleString('en-US')}</span>
          <span className="day-counter__label">
            {days === 1 ? 'day' : 'days'} since announced
            <br />
            <span style={{ opacity: 0.8 }}>{formatDate(p.dateAnnounced)}</span>
          </span>
        </div>
        <div className="day-counter day-counter--secondary">
          <span className="num">{daysStatus.toLocaleString('en-US')}</span>
          <span className="day-counter__label">
            {daysStatus === 1 ? 'day' : 'days'} since last status change (
            {STATUS_LABEL[p.status].toLowerCase()}, {formatDate(p.dateStatusUpdated)})
          </span>
        </div>

        <h3>About this project</h3>
        <p>{p.description}</p>
        {p.statusNote && <p className="detail__note">{p.statusNote}</p>}
        {p.estimatedCompletion && (
          <p className="detail__note">Estimated completion: {p.estimatedCompletion}</p>
        )}

        <h3>Sources</h3>
        <ul className="source-list">
          {p.sources.map((s) => (
            <li key={s.url + s.label}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="ext">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
