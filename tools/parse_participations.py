"""
Parses the federation's national-team participations PDF into the shape the
public results archive uses.

The PDF is a wide table exported from Word. `pdftotext -table` aligns it into
fixed columns, but two values overrun their column and have to be repaired:

  * "IFMA Youth World Championship & U23 World Cup" is wider than the event
    column, so its name runs straight into the start date with no separator
    ("...U23 World  Cup01-Oct-2023").
  * The CISM 2025 and FISU 2026 blocks leave the Year cell blank and carry
    month-year dates ("Jul-25") rather than full ones.

So the event/date boundary is found by locating the first date token with a
regex rather than by slicing at a fixed offset. Every column after the dates is
rectangular and is sliced directly.
"""

import io
import json
import re
import sys

# Columns that are reliably rectangular, measured from the all-whitespace gaps
# between them. Everything before `location` is resolved by regex instead.
COLS = {
    "location": (78, 131),
    "athlete": (133, 160),
    "role": (162, 169),
    # Category and ranking share one span: the CISM 2025 and FISU 2026 blocks
    # place the ranking ~14 characters left of where every other row puts it,
    # so a fixed `result` slice missed it and the category swallowed it. Both
    # are pulled out of the combined span by regex below.
    "categoryAndResult": (171, 231),
    "eventAr": (232, 269),
    "athleteAr": (271, 291),
}

# A placing at the end of the category+ranking span.
RANK = re.compile(r"\b(1st|2nd|3rd|\d+th)\s*$")

# "01-Oct-2023" or "Jul-25"
DATE = re.compile(r"\d{2}-[A-Za-z]{3}-\d{4}|[A-Za-z]{3}-\d{2}")

MEDALS = {"1st": "gold", "2nd": "silver", "3rd": "bronze"}

# Bidi control characters Word embeds around the Arabic cells.
BIDI = re.compile(r"[‪-‮‎‏]")


# Word stores the Arabic cells right-to-left, and extracting them flattens the
# bidi run so a trailing number ("... تحت 23") comes out at the front ("23 ...").
# Only a leading digit group is moved, and only when Arabic text follows it.
LEADING_DIGITS = re.compile(r"^(\d+)\s+(?=[" + chr(0x0600) + "-" + chr(0x06FF) + "])")


def clean(value):
    text = re.sub(r"\s+", " ", BIDI.sub("", value)).strip()
    moved = LEADING_DIGITS.match(text)
    if moved:
        text = text[moved.end():].strip() + " " + moved.group(1)
    return text


def parse(path):
    lines = [l for l in io.open(path, encoding="utf-8").read().split("\n") if l.strip()]
    width = max(len(l) for l in lines)
    rows = []

    for line in lines[1:]:  # skip the header
        padded = line.ljust(width)
        record = {k: clean(padded[s:e]) for k, (s, e) in COLS.items()}

        # The event name runs from after the Year cell up to the first date.
        head = padded[:78]
        dates = list(DATE.finditer(head))
        if not dates:
            raise ValueError(f"no date found in: {line[:80]!r}")

        record["event"] = clean(head[6 : dates[0].start()])
        record["startDate"] = dates[0].group()
        record["endDate"] = dates[1].group() if len(dates) > 1 else dates[0].group()

        year = clean(padded[0:4])
        if not year:
            # CISM 2025 / FISU 2026 leave the cell blank but name the year in
            # the event title; fall back to the date's year.
            found = re.search(r"\b(20\d{2})\b", record["event"])
            if found:
                year = found.group(1)
            else:
                suffix = re.search(r"-(\d{2})$", record["startDate"])
                year = "20" + suffix.group(1) if suffix else ""
        record["year"] = int(year) if year else None

        combined = record.pop("categoryAndResult")
        rank = RANK.search(combined)
        record["result"] = rank.group(1) if rank else ""
        record["category"] = clean(combined[: rank.start()]) if rank else combined

        record["medal"] = MEDALS.get(record["result"], "")
        rows.append(record)

    return rows


if __name__ == "__main__":
    rows = parse(sys.argv[1] if len(sys.argv) > 1 else "part_table.txt")
    json.dump(rows, io.open("participations.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print(f"rows            : {len(rows)}")
    print(f"with a medal    : {sum(1 for r in rows if r['medal'])}")
    print(f"no medal        : {sum(1 for r in rows if not r['medal'])}")
    print(f"missing year    : {sum(1 for r in rows if not r['year'])}")
    print(f"years           : {sorted({r['year'] for r in rows if r['year']})}")
    print()
    print("events:")
    for (y, e) in sorted({(r["year"], r["event"]) for r in rows}):
        n = sum(1 for r in rows if r["year"] == y and r["event"] == e)
        print(f"  {y}  {e:<48} {n:>2}")
