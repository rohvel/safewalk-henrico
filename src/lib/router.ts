/**
 * Tiny hash router.
 *
 * The entire app state lives in location.hash so the site works from any
 * static host with zero server config, and any view can be shared as a URL.
 *
 * Shape:  #/project/example-slug?district=varina&mode=ped
 *         └── path ────────────┘ └── query (filters etc.) ──┘
 */
import { useEffect, useState } from 'react'

export interface HashLocation {
  /** e.g. "/" or "/about" or "/project/some-slug" */
  path: string
  /** the query-string portion after the path, parsed */
  params: URLSearchParams
}

export function parseHash(hash: string): HashLocation {
  // strip the leading "#"; default to "/"
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  const [rawPath = '/', rawQuery = ''] = h.split('?')
  const path = rawPath === '' ? '/' : rawPath
  return { path, params: new URLSearchParams(rawQuery) }
}

export function currentLocation(): HashLocation {
  return parseHash(window.location.hash)
}

/** Build a hash string from a path plus query params (empty params omitted). */
export function buildHash(path: string, params: URLSearchParams): string {
  const q = params.toString()
  return `#${path}${q ? `?${q}` : ''}`
}

/** Navigate, preserving the current query params (filters survive page moves). */
export function navigate(path: string, params?: URLSearchParams): void {
  const p = params ?? currentLocation().params
  window.location.hash = buildHash(path, p)
}

/** Replace only the query params, without adding a history entry per keystroke. */
export function replaceParams(params: URLSearchParams): void {
  const { path } = currentLocation()
  const url = new URL(window.location.href)
  url.hash = buildHash(path, params)
  window.history.replaceState(null, '', url)
  // replaceState doesn't fire hashchange, so notify listeners ourselves.
  window.dispatchEvent(new Event('safewalk:paramschange'))
}

/** React hook: re-renders when the hash (path or params) changes. */
export function useHashLocation(): HashLocation {
  const [loc, setLoc] = useState<HashLocation>(currentLocation)
  useEffect(() => {
    const onChange = () => setLoc(currentLocation())
    window.addEventListener('hashchange', onChange)
    window.addEventListener('safewalk:paramschange', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
      window.removeEventListener('safewalk:paramschange', onChange)
    }
  }, [])
  return loc
}
