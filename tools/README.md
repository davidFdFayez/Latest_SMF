# Data tools

One-off scripts kept with the repo so the data changes they made are
reproducible and reviewable.

## The national-team participations PDF

`docs/SMF_All_National_Team_Participations_Master (1).pdf` was supplied as a
source of medal results. It is **already fully represented** in
`results.json` — 70 of its 71 rows match an existing record on year, athlete and
medal, and the one apparent exception ("Ali Nasser") is the same athlete as the
recorded "Ali Alnasser". Importing it would have duplicated the entire archive,
so nothing was imported.

What the PDF does hold that the archive lacked is the Arabic column pair
(`اللاعب` and `اسم البطولة`). The archive rendered Arabic headings over
English-only names, so those were copied onto the existing records rather than
added as new ones.

    pdftotext -table -enc UTF-8 "docs/SMF_All_National_Team_Participations_Master (1).pdf" part_table.txt
    python parse_participations.py part_table.txt          # -> participations.json
    python enrich_results.py <path-to-results.json> ...     # adds AthleteAr / EventAr in place

`pdftotext -table` is required; `-layout` interleaves the Arabic columns by a
row and cannot be parsed reliably.

### Known gaps, left deliberately empty

Three of the 72 records carry no Arabic athlete name, and the archive shows the
English name for them:

| Record | Why |
|---|---|
| Saifon Boonmapad (2022, silver) | Not present in the PDF at all. |
| Saud Rashed Almarri (2025) | The PDF pairs this athlete with **سعود العمري** — Al-Omari, not Al-Marri. |
| Amer Alanazi (2025) | The PDF pairs this athlete with **عامر العزي**, missing the ن of العنزي. |

The last two are disagreements inside the source document, not extraction
faults — the surrounding rows align correctly. Publishing either would put the
wrong name against a real athlete, so both are withheld until the federation
confirms the correct spelling. See `DISPUTED` in `enrich_results.py`.

Location and category remain English for every row; the PDF has no Arabic for
those columns.

## Accessibility audit (Phase 1 case P8)

`a11y.mjs` checks structure and naming; `contrast.mjs` computes colour contrast
the way WCAG 2.1 defines it. Both drive the installed Chrome through
`playwright-core` and read the rendered DOM, so they see what a user actually
gets rather than what the source implies.

    npm install playwright-core          # not a project dependency; install where you run it
    node a11y.mjs                        # structure, names, landmarks, focus
    node contrast.mjs                    # contrast, with backgrounds resolved

Run them with the site served on `http://localhost:5173`.

Two things worth knowing about the contrast checker:

* It resolves the background by walking up for the first opaque colour. Text
  over a gradient or a photograph cannot be judged that way, so those are
  reported separately as "unverifiable" rather than counted as failures against
  a white background that was never there.
* An `<a>` wrapping an image takes its accessible name from that image's `alt`,
  and anything inside an `aria-hidden` subtree is not in the accessibility tree
  at all. Both are honoured, so the counts match what a real audit tool reports.

### What the audit found and what was fixed

| Fix | Was |
|---|---|
| Results-archive view toggle | `.archive-filters__views .btn` set a white background at higher specificity than `.btn--green`, so the *selected* toggle was white-on-white — an invisible label |
| Section subtitles, site-wide | `--clr-grey-400` on white = 2.54:1; now the muted-text token at 4.83:1 |
| IFMA source chip | 2.93:1; darkened along the same hue to 4.6:1 |
| Gold / bronze medal badges | 2.63:1 and 3.1:1; now just over 4.5:1. Silver already passed at 6.9:1 and is unchanged |
| News card image links | A third link to the same article wrapping a decorative image, so it had no accessible name; now out of the accessibility tree and the tab order |

## Phase 1 checklist

`update_checklist.py` edits the workbook at the XML level so the federation's
styling, column widths and table definition survive untouched — only the
shared-string index of the Status and Notes cells changes. A case whose Notes
cell was blank has no cell in the XML at all, so one is inserted.

    python update_checklist.py <checklist.xlsx>
    python read_xlsx.py <checklist.xlsx>          # read it back to confirm it is still valid

The workbook went from `Fail 2, Pass 10, Blocked 23, Not Started 1` to
`Pass 20, Blocked 16`. The 16 that remain need access to a deployed environment
or cover behaviour that is not built yet — CMS and event admin round-trips,
login/password reset, RBAC row-scoping, session security, and stored data
standards. Code alone cannot clear them.
