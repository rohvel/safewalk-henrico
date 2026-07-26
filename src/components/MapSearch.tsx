/**
 * Address search for the map route: "what's promised and what's on record
 * near me?" — the question a resident actually arrives with.
 *
 * PRIVACY. People type their home address here, so this is the one piece of
 * state on the site that is deliberately NOT shareable. It never touches the
 * URL hash, never goes to storage, and never leaves the page except as a
 * query to OpenStreetMap's geocoder (see src/lib/geocode.ts). The note under
 * the input says so, because a promise the visitor can't see isn't one.
 *
 * ANNOUNCEMENTS. This owns its own live region rather than sharing the map's.
 * The map's region is ambient and debounced 600ms — it describes whatever
 * drifts under the keyboard crosshair while panning. A search result is the
 * opposite: a direct, immediate answer to a deliberate submit. Sharing one
 * region would let pan chatter from the fly-to overwrite the answer (or
 * arrive after it and look like the answer). They also can't collide in
 * practice, since the map only announces while the canvas itself has
 * focus-visible and searching necessarily takes focus away from it — but two
 * regions make that a structural guarantee instead of a coincidence.
 */
import { useId, useRef, useState } from 'react'
import { geocodeInHenrico } from '../lib/geocode'
import type { LngLat } from '../lib/geo'
import { NEARBY_RADIUS_MILES } from '../lib/nearby'
import type { NearbyCounts } from '../lib/nearby'

export interface SearchPlace {
  coords: LngLat
  label: string
}

interface Props {
  boundary: GeoJSON.FeatureCollection | null
  /** Current result, owned by the parent (it also drives the map marker). */
  result: SearchPlace | null
  onResult: (place: SearchPlace | null) => void
  /** Counts near `result`, computed by the parent from the visible data. */
  nearby: NearbyCounts | null
}

export default function MapSearch({ boundary, result, onResult, nearby }: Props) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const inputId = useId()
  const noteId = useId()
  const resultRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || busy) return

    setBusy(true)
    setError(null)
    // Clear any previous result up front so the panel can never show last
    // search's answer next to this search's address.
    onResult(null)
    setAnnouncement('Searching…')

    const res = await geocodeInHenrico(q, boundary)
    setBusy(false)

    if (!res.ok) {
      setError(res.message)
      setAnnouncement(res.message)
      // The map was never moved, so there is nothing to undo — the view is
      // exactly where the visitor left it.
      return
    }

    onResult({ coords: res.coords, label: res.label })
    // The counts come from the parent on the next render; announce the part
    // we can state now, and the panel carries the detail once focused.
    setAnnouncement(`Found ${res.label}. Showing what is nearby on the map.`)
    // Focus the result panel: a sighted visitor sees the map fly, a screen
    // reader or keyboard user gets nothing unless we hand them the answer.
    // Deliberately NOT the map canvas — focusing that arms the crosshair and
    // would start the map's own announcements over the top of this one.
    requestAnimationFrame(() => resultRef.current?.focus())
  }

  function clearSearch() {
    setQuery('')
    setError(null)
    onResult(null)
    setAnnouncement('Search cleared. Showing all of Henrico County.')
    inputRef.current?.focus()
  }

  return (
    <div className="map-search">
      <form className="map-search__form" onSubmit={onSubmit} role="search">
        <label className="map-search__label" htmlFor={inputId}>
          Find an address
        </label>
        <div className="map-search__row">
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            className="map-search__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Street or address in Henrico"
            autoComplete="off"
            aria-describedby={noteId}
            enterKeyHint="search"
          />
          <button type="submit" className="btn btn--small" disabled={busy || !query.trim()}>
            {busy ? 'Searching…' : 'Search'}
          </button>
          {(result || query || error) && (
            <button type="button" className="btn btn--small" onClick={clearSearch}>
              Clear
            </button>
          )}
        </div>
        <p className="map-search__note" id={noteId}>
          Sent to OpenStreetMap's geocoder only — not stored, and never added to the page link.
        </p>
      </form>

      {error && (
        <p className="map-search__error">{error}</p>
      )}

      {result && (
        <div className="map-search__result" tabIndex={-1} ref={resultRef}>
          <p className="map-search__place">{result.label}</p>
          {nearby && (
            <>
              <p className="map-search__counts">
                <strong>{nearby.projects}</strong>{' '}
                {nearby.projects === 1 ? 'tracked project' : 'tracked projects'} and{' '}
                <strong>{nearby.crashes.toLocaleString('en-US')}</strong>{' '}
                {nearby.crashes === 1 ? 'recorded crash' : 'recorded crashes'} within{' '}
                {NEARBY_RADIUS_MILES} mile, among what the current filters show.
              </p>
              <p className="map-search__caveat">
                Counts only — too few records to say anything about how risky a street is.
              </p>
            </>
          )}
        </div>
      )}

      {/* This component's own live region — see the note at the top of the file. */}
      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
