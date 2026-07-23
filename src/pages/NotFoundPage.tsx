/** 404 — on-voice and useful. */
export default function NotFoundPage() {
  return (
    <main id="main" className="doc">
      <h1>That page isn't on the map</h1>
      <p className="lede">
        The address may have changed, or the link may be incomplete.
      </p>
      <p>
        <a className="btn btn--primary" href="#/">
          ← Back to the map
        </a>
      </p>
    </main>
  )
}
