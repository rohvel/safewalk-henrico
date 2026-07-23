/**
 * About / methodology: mission, sources, why this exists, update cadence,
 * the full disclaimer, and contact.
 */
export default function AboutPage() {
  return (
    <main id="main" className="doc">
      <h1>About SafeWalk Henrico</h1>
      <p className="lede">
        SafeWalk Henrico tracks every pedestrian-safety project Henrico County has promised —
        sidewalks, crosswalks, shared-use paths, signals — and how long each has been waiting.
        It puts those commitments on one map, next to where crashes involving people walking and
        biking have actually happened. The goal is simple visibility: the county set a target, and
        residents should be able to see the work in progress.
      </p>

      <section>
        <h2>Why this exists</h2>
        <p>
          Henrico is one of only two Virginia counties (with Arlington) that maintains its own
          roads — about 1,415 miles of them. That means VDOT's statewide project tracker
          structurally excludes most county pedestrian projects. The county's own information is
          real but scattered: capital budget PDFs, monthly "Word on the Street" district reports,
          and the Arrive Alive safety plan. No interactive tracker existed, so this site assembles
          one from those public documents.
        </p>
        <p>
          Through the{' '}
          <a
            href="https://henrico.gov/works/arrive-alive-henrico/"
            target="_blank"
            rel="noopener noreferrer"
            className="ext"
          >
            Arrive Alive Henrico Safety Action Plan
          </a>{' '}
          (July 2025, funded through the federal Safe Streets and Roads for All program), the
          county committed to reducing roadway fatalities and serious injuries by more than 50
          percent by 2035. That adopted goal is this site's reference point.
        </p>
      </section>

      <section>
        <h2>Data sources</h2>
        <ul>
          <li>
            <a
              href="https://virginiaroads-vdot.opendata.arcgis.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="ext"
            >
              VDOT open data portal (Virginia Roads)
            </a>{' '}
            — crash records ("CrashData basic," originating from DMV's TREDS system). This site
            shows crashes in Henrico involving a person walking or biking, for the five most
            recent full calendar years.
          </li>
          <li>
            <a
              href="https://henrico.gov/budget/"
              target="_blank"
              rel="noopener noreferrer"
              className="ext"
            >
              Henrico County capital budget (CIP) documents
            </a>{' '}
            — project commitments and funding.
          </li>
          <li>
            <a
              href="https://henrico.gov/works/"
              target="_blank"
              rel="noopener noreferrer"
              className="ext"
            >
              Henrico Public Works, "Word on the Street" monthly district reports
            </a>{' '}
            — project status updates.
          </li>
          <li>
            <a
              href="https://henrico.gov/assets/Arrive-Alive-Henrico-SAP-July-2025.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="ext"
            >
              Arrive Alive Henrico Safety Action Plan (PDF)
            </a>{' '}
            — the county's adopted safety goal and project priorities.
          </li>
          <li>
            Henrico County GIS — school locations.
          </li>
          <li>
            <a
              href="https://tigerweb.geo.census.gov/"
              target="_blank"
              rel="noopener noreferrer"
              className="ext"
            >
              US Census Bureau, TIGERweb
            </a>{' '}
            — the Henrico County boundary line shown on the map.
          </li>
          <li>Basemap: OpenFreeMap (Positron style), data © OpenStreetMap contributors.</li>
        </ul>
      </section>

      <section>
        <h2>How projects are updated</h2>
        <p>
          Project statuses are reviewed monthly, when Public Works publishes its "Word on the
          Street" district reports. Every project entry lists its sources; a claim without a
          source doesn't ship. Entries marked <strong>Example</strong> are placeholders that have
          not been verified against county documents and will be replaced.
        </p>
      </section>

      <section>
        <h2>Disclaimer</h2>
        <p className="disclaimer">
          SafeWalk Henrico is an independent student project. Data is compiled from public sources
          (VDOT, Henrico County documents) and is not official county information. Verify details
          with Henrico County Public Works before relying on them. Not affiliated with Henrico
          County, PlanRVA, or VDOT.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Corrections and updates are welcome:{' '}
          {/* TODO: replace with a real contact address before launch */}
          <a href="mailto:hello@example.com">hello@example.com</a> (placeholder address — to be
          replaced).
        </p>
      </section>
    </main>
  )
}
