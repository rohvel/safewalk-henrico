/**
 * Project detail: the crosswalk stepper at full size, the day counters in
 * large tabular mono, sources (every claim cites its document), and a copy-
 * link button. Rendered as a slide-over panel on desktop and a full bottom
 * sheet on mobile; works identically when the map is unavailable.
 */
import { useEffect, useRef, useState } from 'react'
import type { Project } from '../types'
import { STATUS_LABEL, TYPE_LABEL } from '../types'
import { geometryPoints, hasLocation } from '../data/projects'
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

  /**
   * Google Maps satellite view at this project's location, for confirming a
   * project really is where its name says.
   *
   * Deliberately an outbound link, not a satellite basemap toggle: this
   * site's data styling assumes a muted light basemap, and imagery would
   * drown the crash and project layers it exists to show. A link buys the
   * verification without the visual cost — and without taking on imagery
   * licensing. Omitted entirely for projects with no mapped location rather
   * than pointing somewhere generic and implying a precision we don't have.
   *
   * For a line, the midpoint vertex is used, since the ends of a two-mile
   * corridor are a poor answer to "where is this?".
   */
  const satelliteUrl = (() => {
    const pts = geometryPoints(p)
    if (pts.length === 0) return null
    const [lng, lat] = pts[Math.floor(pts.length / 2)]
    // basemap=satellite is what Google's own UI sets for imagery view.
    return `https://www.google.com/maps/@?api=1&map_action=map&center=${lat},${lng}&zoom=18&basemap=satellite`
  })()

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
            {daysStatus === 1 ? 'day' : 'days'} since this status was last confirmed
            <br />
            <span style={{ opacity: 0.8 }}>
              {STATUS_LABEL[p.status]} as of {formatDate(p.dateStatusUpdated)} — the county may
              have updated it since
            </span>
          </span>
        </div>

        {!hasLocation(p) && (
          <p className="detail__note detail__note--unmapped">
            Not shown on the map. The county named this project but not a location this
            site could pin down with confidence, so it is listed without a point rather
            than drawn in the wrong place.
          </p>
        )}

        <h3>About this project</h3>
        <p>{p.description}</p>
        {p.statusNote && <p className="detail__note">{p.statusNote}</p>}
        {p.estimatedCompletion && (
          <p className="detail__note">Estimated completion: {p.estimatedCompletion}</p>
        )}

        {satelliteUrl && (
          <p className="detail__satellite">
            <a href={satelliteUrl} target="_blank" rel="noopener noreferrer" className="ext">
              View this location on satellite imagery
            </a>
          </p>
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
