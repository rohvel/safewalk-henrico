/**
 * Lazy loader for the two committed GeoJSON files.
 *
 * Crashes: tries /data/crashes.geojson first. If that's missing or broken it
 * falls back to /data/crashes.sample.geojson and flags `isSample`, which the
 * UI turns into an unmissable banner — sample data must never pass as real.
 */
import { useEffect, useState } from 'react'

export interface CrashCollection {
  type: 'FeatureCollection'
  properties?: {
    source?: string
    fetched?: string
    years?: number[]
    sample?: boolean
  }
  features: GeoJSON.Feature[]
}

export interface CrashData {
  collection: CrashCollection | null
  isSample: boolean
  failed: boolean
}

export function useCrashData(): CrashData {
  const [state, setState] = useState<CrashData>({ collection: null, isSample: false, failed: false })

  useEffect(() => {
    let cancelled = false
    async function load() {
      for (const [url, isSample] of [
        ['data/crashes.geojson', false],
        ['data/crashes.sample.geojson', true],
      ] as const) {
        try {
          const res = await fetch(url)
          if (!res.ok) continue
          const json = (await res.json()) as CrashCollection
          if (!cancelled) {
            // a file can also self-identify as sample via its properties
            setState({ collection: json, isSample: isSample || json.properties?.sample === true, failed: false })
          }
          return
        } catch {
          // try the next candidate
        }
      }
      if (!cancelled) setState({ collection: null, isSample: false, failed: true })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function useSchoolData(): GeoJSON.FeatureCollection | null {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('data/schools.geojson')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json) setData(json)
      })
      .catch(() => {
        /* schools are a nice-to-have layer; the map works without them */
      })
    return () => {
      cancelled = true
    }
  }, [])
  return data
}

export function useBoundaryData(): GeoJSON.FeatureCollection | null {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('data/henrico-boundary.geojson')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json) setData(json)
      })
      .catch(() => {
        /* the boundary is an orientation aid; the map works without it */
      })
    return () => {
      cancelled = true
    }
  }, [])
  return data
}
