/**
 * The honest router: SafeWalk tracks promised projects; these existing
 * tools handle everything else. Every URL below was verified live during
 * the build (2026-07) — if one breaks, fix or remove it rather than
 * shipping a dead link.
 */

interface Tool {
  name: string
  description: string
  url: string
  cta: string
}

const TOOLS: Tool[] = [
  {
    name: 'PlanRVA Near Miss Dashboard',
    description:
      'Almost got hit? Report near misses and collisions so regional planners can see them.',
    url: 'https://nearmiss.planrva.org/',
    cta: 'Report a near miss',
  },
  {
    name: 'Henrico County — report a road problem',
    description:
      'Pothole, broken sidewalk, streetlight out on a county road. Online form, or call Public Works: 804-727-8300 (West End), 804-652-3975 (East End).',
    url: 'https://henrico.gov/services/report-a-pothole/',
    cta: 'Report to the county',
  },
  {
    name: 'my.vdot.virginia.gov',
    description:
      'Problems on VDOT-maintained roads: interstates, U.S. highways, and primary routes.',
    url: 'https://my.vdot.virginia.gov/',
    cta: 'Report to VDOT',
  },
  {
    name: 'Richmond Vision Zero dashboard',
    description: 'Crash data for the City of Richmond, next door.',
    url: 'https://www.rva.gov/public-works/vision-zero',
    cta: 'See Richmond data',
  },
]

export default function ToolsPage() {
  return (
    <main id="main" className="doc">
      <h1>Existing tools</h1>
      <p className="lede">
        SafeWalk tracks promised projects. These tools handle everything else — reporting,
        requests, and neighboring data.
      </p>
      <div className="tools-grid">
        {TOOLS.map((t) => (
          <div className="panel tool-card" key={t.url}>
            <h3>{t.name}</h3>
            <p>{t.description}</p>
            <a
              className="btn ext"
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t.cta} — ${t.name} (opens in new tab)`}
            >
              {t.cta}
            </a>
          </div>
        ))}
      </div>
    </main>
  )
}
