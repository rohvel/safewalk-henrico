/**
 * Badge for placeholder entries. Seed data must be impossible to mistake
 * for a real county commitment, so every placeholder renders one of these.
 */
export default function ExampleBadge({ long }: { long?: boolean }) {
  return (
    <span className="badge-example">
      {long ? 'Example — replace with verified data' : 'Example'}
    </span>
  )
}
