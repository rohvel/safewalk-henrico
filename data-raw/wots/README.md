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
