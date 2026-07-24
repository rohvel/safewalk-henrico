/**
 * Site header: wordmark (with the tiny crosswalk glyph), mission line,
 * and navigation. Present on every route.
 */
import { useHashLocation } from '../lib/router'

const NAV = [
  { path: '/', label: 'Map' },
  { path: '/projects', label: 'Projects' },
  { path: '/crashes', label: 'Crashes' },
  { path: '/tools', label: 'Tools' },
  { path: '/about', label: 'About' },
  { path: '/changelog', label: 'Changelog' },
]

export default function Header() {
  const { path } = useHashLocation()

  const isCurrent = (navPath: string) => {
    if (navPath === '/') return path === '/' || path.startsWith('/project/')
    if (navPath === '/projects') return path === '/projects'
    return path === navPath
  }

  return (
    <header className="header">
      <a className="wordmark" href="#/" aria-label="SafeWalk Henrico — home">
        <span className="wordmark__glyph" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="wordmark__name">SafeWalk Henrico</span>
      </a>
      <p className="header__mission">
        Tracking every promised pedestrian-safety project in Henrico County.
      </p>
      <nav className="header__nav" aria-label="Main">
        {NAV.map((item) => (
          <a
            key={item.path}
            href={`#${item.path}`}
            aria-current={isCurrent(item.path) ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  )
}
