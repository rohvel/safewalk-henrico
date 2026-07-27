# Word on the Street — source PDFs

These are Henrico County Public Works "Word on the Street" district
newsletters, March–September 2024 (May 2024 was never published), one PDF
per magisterial district (Brookland, Fairfield, Three Chopt, Tuckahoe,
Varina) per month: `<District>-District-<Month>-2024.pdf`.

They were retrieved via the county's own WordPress media REST API
(`henrico.gov/wp-json/wp/v2/media?search=<District>%20District`) because the
newsletter archive page (`henrico.gov/pr/word-on-the-street-newsletter-archives/`)
no longer lists them — it's static HTML with a signup button and nothing
else. The series was discontinued after the September 2024 issue.

These are county publications, retained here for source verification, not
original work — every project entry in `src/data/projects.json` that draws
on a "Word on the Street" issue cites the specific PDF it came from, and
those citations stay checkable even if the county removes the files from
its own site.

Each PDF has a `.txt` sibling — a plain-text extraction (`pdftotext -layout`),
regenerable from the PDF at any time, kept here so the newsletters are
greppable without re-running that step or opening 30 PDFs by hand.

## Redaction — five files are NOT faithful copies

**The five September 2024 PDFs each have one page removed.** They are
otherwise byte-for-byte the county's files, but they are no longer complete
copies of what the county published. If you need the unmodified originals,
fetch them from `henrico.gov/assets/<District>-District-September-2024.pdf`.

| File | Page removed | Pages |
|---|---|---|
| `Brookland-District-September-2024.pdf` | 4 | 6 → 5 |
| `Fairfield-District-September-2024.pdf` | 5 | 7 → 6 |
| `Three-Chopt-District-September-2024.pdf` | 4 | 6 → 5 |
| `Tuckahoe-District-September-2024.pdf` | 4 | 6 → 5 |
| `Varina-District-September-2024.pdf` | 4 | 6 → 5 |

### What was removed and why

An employee-spotlight story, syndicated identically across all five district
editions, that identified a child by his initials together with a medical
detail, the fact he lives in Henrico, his refuse-collection day, and a quote
from his parent. The county published it with consent, for its own
newsletter. That consent does not extend to redistribution in a public
repository, the subject is a minor, and none of it bears on this project's
subject — which is pedestrian-safety projects, not residents.

Removed along with it, unavoidably: the same story named the county employee
being recognised (an award for customer service), and the same page carried
some GRTC Pulse expansion and mosquito-control news. Keeping those while
dropping only the child's details was not possible — see below — and none of
them is cited by any project entry.

### Why a whole page, rather than just the sentences

These PDFs draw text as Identity-H two-byte glyph IDs, so the words do not
exist as searchable characters inside the file; there is nothing to find and
replace. Editing at the glyph level risks producing a subtly broken PDF.
Removing a page is a structural operation — qpdf copies the retained pages
through untouched — so it is the finest cut that can be made here without
putting the file's integrity at risk.

### What was deliberately kept

Everything else, including the county staff contact addresses and phone
numbers printed in every issue, the named county employees elsewhere in the
series, and the note in the Brookland September issue that Lambert Way is
named for a police captain killed in a 2021 hit-and-run. Those are official
public information published by the county for the public. (The site itself
names only the street, never the person — see the content rules.)

### Effect on citations

None. Every project listing lives on pages 1–2 of these issues; the removed
page is always page 4 or later. All 17 project entries that cite a September
2024 issue are still fully supported, and every cited PDF is still present.

The `.txt` extractions for these five were regenerated from the redacted
PDFs, so text and PDF cannot disagree, and each carries a `[REDACTED
EXTRACTION]` notice at the top.
