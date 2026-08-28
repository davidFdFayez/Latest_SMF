"""
Adds Arabic athlete and event names to the results archive.

The participations PDF turned out to hold the same 71 medals the archive
already lists, so importing it would only duplicate them. What it does hold
that the archive lacks is the Arabic column pair — اللاعب and اسم البطولة —
for every row. The archive renders Arabic headers over English-only data, so
those names are exactly the missing half.

Each existing record is matched to a PDF row on year plus a normalised name.
Normalisation has to absorb how the two sources differ:

    Ali Nasser              vs  Ali Alnasser
    Ahmed Mansour M. Almufarrij vs Ahmed Mansour Almufarrij
    Azam Alomari            vs  Azzam Al Omary

so initials are dropped, Al/El prefixes are glued to the following word,
doubled letters are collapsed, and tokens are compared as a set. Where a record
has no counterpart the Arabic fields are left empty and the UI falls back to
the English name, rather than guessing a transliteration.
"""

import io
import json
import re
import sys


def normalise(name):
    n = re.sub(r"\s+", " ", (name or "")).strip().lower().replace("-", " ")
    n = re.sub(r"\b[a-z]\.\s*", " ", n)          # middle initials: "M."
    n = re.sub(r"[^a-z ]", "", n)
    n = re.sub(r"\b(al|el)\s+", r"\1", n)        # "Al Omary" -> "alomary"
    n = re.sub(r"(.)\1", r"\1", n)               # "Azzam" -> "azam"
    # "Alnasser" and "Nasser" are the same surname written two ways, so each
    # token is also indexed without its "al" prefix.
    tokens = set()
    for t in n.split():
        if not t:
            continue
        tokens.add(t)
        if t.startswith("al") and len(t) > 4:
            tokens.add(t[2:])
    return frozenset(tokens)


def score(a, b):
    """Token overlap, so a two-of-three name match still counts."""
    if not a or not b:
        return 0.0
    return len(a & b) / max(len(a), len(b))


# Two rows where the source document's Arabic and English names disagree on the
# surname itself, not merely on transliteration:
#
#   Saud Rashed M. Almarri  ->  سعود العمري   (Al-Omari, not Al-Marri / المري)
#   AMER Alanazi            ->  عامر العزي    (missing the ن of العنزي)
#
# The rest of the column is correctly aligned and correct, so these are
# discrepancies in the document rather than extraction faults. Publishing
# either would put a wrong name against a real athlete, and leaving the Arabic
# empty simply shows the English name, so they are withheld pending the
# federation confirming which spelling is right.
DISPUTED = {"saud rashed m. almarri", "amer alanazi"}


def build_index(participations):
    index = {}
    for row in participations:
        index.setdefault(row["year"], []).append(row)
    return index


def enrich(results, participations):
    index = build_index(participations)
    matched = unmatched = 0
    report = []

    for record in results:
        year = record.get("Year")
        target = normalise(record.get("Athlete"))

        best, best_score = None, 0.0
        for candidate in index.get(year, []):
            s = score(target, normalise(candidate["athlete"]))
            if s > best_score:
                best, best_score = candidate, s

        # Two of three name tokens must agree before the Arabic name is copied
        # onto a record; below that it is safer to show the English name.
        if best and best_score >= 0.6:
            disputed = best["athlete"].strip().lower() in DISPUTED
            # The event name is still safe to carry over on a disputed row; only
            # the athlete's own name is withheld.
            record["AthleteAr"] = "" if disputed else best["athleteAr"]
            record["EventAr"] = best["eventAr"]
            if disputed:
                unmatched += 1
                report.append((year, record.get("Athlete"), "disputed spelling"))
            else:
                matched += 1
        else:
            record["AthleteAr"] = ""
            record["EventAr"] = ""
            unmatched += 1
            report.append((year, record.get("Athlete"), round(best_score, 2)))

    return results, matched, unmatched, report


if __name__ == "__main__":
    participations = json.load(io.open("participations.json", encoding="utf-8"))
    targets = sys.argv[1:]

    for path in targets:
        results = json.load(io.open(path, encoding="utf-8-sig"))
        results, matched, unmatched, report = enrich(results, participations)

        json.dump(results, io.open(path, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)

        print(f"{path}")
        print(f"  records {len(results)}  matched {matched}  unmatched {unmatched}")
        for year, name, s in report:
            print(f"    no Arabic name: {year} {name} ({s})")
