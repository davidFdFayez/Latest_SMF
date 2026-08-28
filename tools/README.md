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
