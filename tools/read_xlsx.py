"""Reads the checklist back out, to confirm the edit produced a valid workbook."""
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def read(path):
    z = zipfile.ZipFile(path)
    # A corrupt archive or malformed part raises here rather than silently.
    bad = z.testzip()
    if bad:
        raise SystemExit(f"corrupt entry: {bad}")

    shared = []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in root.findall(NS + "si"):
        shared.append("".join(t.text or "" for t in si.iter(NS + "t")))

    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.iter(NS + "row"):
        vals = {}
        for c in row.findall(NS + "c"):
            ref = c.get("r")
            col = "".join(ch for ch in ref if ch.isalpha())
            v = c.find(NS + "v")
            if v is None:
                vals[col] = ""
            elif c.get("t") == "s":
                vals[col] = shared[int(v.text)]
            else:
                vals[col] = v.text or ""
        rows.append(vals)
    return rows


rows = read(sys.argv[1])
print(f"parsed OK: {len(rows)} rows, {len(rows[0])} columns")
print()
counts = {}
for r in rows[1:]:
    counts[r.get("G", "")] = counts.get(r.get("G", ""), 0) + 1
print("status tally:", counts)
print()
want = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else set()
for r in rows[1:]:
    if not want or r.get("A") in want:
        note = (r.get("H") or "")[:96]
        print(f"  {r.get('A'):<4} {r.get('G'):<12} {note}")
