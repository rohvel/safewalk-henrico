/**
 * About / methodology: mission, sources, why this exists, update cadence,
 * the full disclaimer, and contact.
 */
import crashContext from '../data/crashContext.json'
import { dataCutoffDate } from '../data/projects'
import { formatDate, formatMonthYear } from '../lib/format'
import { LATEST_CRASH_DATE, YEAR_RANGE, isYearPossiblyPartial } from '../lib/urlState'

/**
 * Contact address, assembled at runtime rather than written as one literal.
 *
 * This is mild scraper resistance, nothing more. A harvester that fetches the
 * page HTML finds nothing (this is a client-rendered SPA), and one that
 * regexes the JS bundle finds no contiguous match either — `.join()` is a
 * method call, so the bundler cannot constant-fold it away the way it would
 * fold `'a' + '@' + 'b'`. A scraper that actually executes the page and reads
 * the DOM still gets it, and that is fine: the address is meant to be
 * reachable.
 *
 * Crucially this costs nothing in accessibility. The rendered text node is
 * the complete, correct address, so a screen reader announces it normally,
 * it selects and copies normally, and the mailto: href is built from the
 * same value so the link works normally. Approaches that break any of
 * those — CSS direction tricks, decoy spans, entity soup — were rejected;
 * being readable matters more than being unharvestable.
 */
const CONTACT_EMAIL = ['safewalkhenrico', 'gmail.com'].join('@')

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
            shows every crash in Henrico involving a person walking or biking,{' '}
            {YEAR_RANGE.min}–{YEAR_RANGE.max}
            {isYearPossiblyPartial(YEAR_RANGE.max) && (
              <>
                {' '}
                ({YEAR_RANGE.max} is year-to-date, not a complete year — the data runs through{' '}
                {formatDate(LATEST_CRASH_DATE)})
              </>
            )}
            . That's a narrow slice of VDOT's crash records, not a count of all crashes in the
            county: Henrico logged{' '}
            {crashContext.allCrashesTotal.toLocaleString('en-US')} reported crashes of every kind
            in {crashContext.allCrashesYears[0]}–{crashContext.allCrashesYears.at(-1)} alone, and
            only {crashContext.pedBikeInWindow} of those involved someone walking or biking. This
            site tracks that smaller pedestrian/cyclist slice specifically — figures here should
            never be read as "all crashes in Henrico." You can{' '}
            <a href="#/crashes">read every one of them as a sortable table</a> — the same data the
            map draws as dots, in a form that works without a mouse or a screen. Road names come
            from VDOT's own route records and are never looked up from coordinates, so no road
            name is approximated; where VDOT recorded none, the table says "Not recorded".
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
        <p>
          A note on reading the map and table: crash counts show where crashes were reported, not
          where walking or biking is most dangerous. A busier road sees more of everything, crashes
          included, so it will usually show more dots than a quiet one — that's traffic volume, not
          necessarily a riskier crossing.
        </p>
        <p>
          A note on "fatal": this site marks a crash fatal using VDOT's own severity scale (a
          "K"-severity crash) — {crashContext.fatalPedBikeCount} of {crashContext.pedBikeTotal}{' '}
          pedestrian/cyclist crashes, {crashContext.fatalPedBikeYears[0]}–
          {crashContext.fatalPedBikeYears[1]}. That's a count of crashes, not of people: those
          crashes killed {crashContext.pedestriansKilled} pedestrians and{' '}
          {crashContext.peopleKilled} people in total (pedestrians, cyclists, and anyone else
          involved). The two death counts differ from the crash count and from each other — a
          fatal crash where only a cyclist died doesn't add to the pedestrian figure, and one
          crash on record killed two people — so this site always states which of the three it
          means and never compresses them into one number.
        </p>
      </section>

      <section>
        <h2>Where projects come from</h2>
        <p>
          Every project here is taken from Public Works' "Word on the Street" district
          newsletter, and its status is the section the county filed it under that month —
          "Starting Soon," "New Construction This Month," "Currently in Construction." Watching
          a project move between those sections is the whole point. Every entry lists its
          sources; a claim without a source doesn't ship. A project marked{' '}
          <strong>Not on map</strong> is real and sourced, but the county named it without a
          location this site could pin down confidently — it is listed without a point rather
          than drawn on the wrong street.
        </p>
      </section>

      <section>
        <h2>Data currency</h2>
        <p>
          <strong>
            Project data on this site reflects county publications through{' '}
            {formatMonthYear(dataCutoffDate())}.
          </strong>{' '}
          The county published per-district "Word on the Street" newsletters as PDFs from March
          through September 2024, then discontinued that PDF series in favor of an email
          newsletter. This site has not yet found an equivalent public, per-project status feed
          to replace it, so most project statuses here date to that last PDF issue — some are
          nearly two years old. Current status for these projects has been requested from
          Henrico Public Works; this page will note it if and when that changes.
        </p>
        <p>
          A handful of entries are more current than that: where a county project page
          independently confirmed a newer status (a signal installation completed, a project
          marked "Completed" in the county's own system), this site cites that page directly and
          uses its date instead. Every project detail page shows exactly when its status was
          last confirmed, next to the status itself, precisely so a 2024 snapshot is never read
          as 2026 fact.
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
          Corrections and updates are welcome: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          . If something here is wrong, say so and it gets fixed or removed.
        </p>
      </section>
    </main>
  )
}
