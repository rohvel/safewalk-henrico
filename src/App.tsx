/**
 * App shell: routing, per-route document metadata, header, goal banner,
 * and footer. Routes:
 *
 *   #/                    map (home)
 *   #/project/:slug       map + project detail
 *   #/projects            standalone project list (no-map fallback)
 *   #/crashes             crash data as an accessible table (non-canvas equivalent)
 *   #/about  #/tools  #/changelog
 *   anything else         404
 */
import { useEffect } from 'react'
import { useHashLocation, replaceParams } from './lib/router'
import { readFilters, writeFilters } from './lib/urlState'
import type { Filters } from './lib/urlState'
import { findProject } from './data/projects'
import Header from './components/Header'
import GoalBanner from './components/GoalBanner'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import ProjectsPage from './pages/ProjectsPage'
import CrashesPage from './pages/CrashesPage'
import AnalysisPage from './pages/AnalysisPage'
import AboutPage from './pages/AboutPage'
import ToolsPage from './pages/ToolsPage'
import ChangelogPage from './pages/ChangelogPage'
import NotFoundPage from './pages/NotFoundPage'

const TITLES: Record<string, string> = {
  '/': 'SafeWalk Henrico — Tracking promised pedestrian-safety projects',
  '/projects': 'All projects — SafeWalk Henrico',
  '/crashes': 'Reported crashes — SafeWalk Henrico',
  '/analysis': 'Crashes vs projects by corridor — SafeWalk Henrico',
  '/about': 'About & methodology — SafeWalk Henrico',
  '/tools': 'Existing tools — SafeWalk Henrico',
  '/changelog': 'Changelog — SafeWalk Henrico',
}

export default function App() {
  const { path, params } = useHashLocation()
  const filters = readFilters(params)
  const setFilters = (f: Filters) => replaceParams(writeFilters(f, params))

  const projectId = path.startsWith('/project/') ? path.slice('/project/'.length) : null
  const selected = projectId ? (findProject(projectId) ?? null) : null
  const isMapRoute = path === '/' || (projectId !== null && selected !== null)
  const notFound = !isMapRoute && !(path in TITLES)

  // Per-route title (helps history, tabs, and screen readers).
  useEffect(() => {
    document.title = selected
      ? `${selected.name} — SafeWalk Henrico`
      : notFound
        ? 'Page not found — SafeWalk Henrico'
        : (TITLES[path] ?? TITLES['/'])
  }, [path, selected, notFound])

  // Focus main content without touching the hash (which would re-route).
  const skipToMain = (e: React.MouseEvent) => {
    e.preventDefault()
    const main = document.getElementById('main')
    if (main) {
      main.setAttribute('tabindex', '-1')
      main.focus({ preventScroll: false })
    }
  }

  return (
    <div className={`app ${isMapRoute ? 'app--map' : 'app--doc'}`}>
      <a className="skip-link" href="#main" onClick={skipToMain}>
        Skip to content
      </a>
      <Header />
      {isMapRoute && <GoalBanner filters={filters} onChange={setFilters} />}
      {isMapRoute ? (
        <HomePage filters={filters} onFiltersChange={setFilters} selected={selected} />
      ) : path === '/projects' ? (
        <ProjectsPage filters={filters} onFiltersChange={setFilters} />
      ) : path === '/crashes' ? (
        <CrashesPage filters={filters} onFiltersChange={setFilters} />
      ) : path === '/analysis' ? (
        <AnalysisPage filters={filters} onFiltersChange={setFilters} />
      ) : path === '/about' ? (
        <AboutPage />
      ) : path === '/tools' ? (
        <ToolsPage />
      ) : path === '/changelog' ? (
        <ChangelogPage />
      ) : (
        <NotFoundPage />
      )}
      {!isMapRoute && <Footer />}
    </div>
  )
}
