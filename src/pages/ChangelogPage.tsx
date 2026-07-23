/**
 * Changelog: the monthly accountability record. Renders
 * src/data/changelog.json — newest entry first.
 */
import changelogRaw from '../data/changelog.json'
import type { ChangelogEntry } from '../types'
import { formatDate } from '../lib/format'

const changelog = changelogRaw as ChangelogEntry[]

export default function ChangelogPage() {
  const entries = [...changelog].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <main id="main" className="doc">
      <h1>Changelog</h1>
      <p className="lede">
        What changed and when — updated monthly as county documents publish.
      </p>
      {entries.map((e) => (
        <article className="changelog-entry" key={e.date}>
          <h2>{formatDate(e.date)}</h2>
          <ul>
            {e.entries.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
      ))}
    </main>
  )
}
