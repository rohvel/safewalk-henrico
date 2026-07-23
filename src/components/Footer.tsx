/**
 * Footer for document pages. Carries the full disclaimer — it also appears
 * on the About page, per the site's content rules.
 */
export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <p>
          <strong>SafeWalk Henrico is an independent student project.</strong> Data is compiled from
          public sources (VDOT, Henrico County documents) and is not official county information.
          Verify details with Henrico County Public Works before relying on them.
        </p>
        <p>
          Not affiliated with Henrico County, PlanRVA, or VDOT. Crash data: VDOT via the{' '}
          <a
            href="https://virginiaroads-vdot.opendata.arcgis.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="ext"
          >
            Virginia Roads open data portal
          </a>
          . Basemap © OpenFreeMap, © OpenMapTiles, data ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="ext"
          >
            OpenStreetMap contributors
          </a>
          .
        </p>
      </div>
    </footer>
  )
}
