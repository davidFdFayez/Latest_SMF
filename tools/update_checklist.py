"""
Updates the Phase 1 checklist's Status and Notes for the cases whose outcome
has actually changed.

The workbook is edited in place at the XML level rather than rewritten by a
spreadsheet library: that keeps the styling, the column widths, and the table
definition exactly as the federation authored them. Only two cells per affected
row are touched — the shared-string index each points at.
"""

import io
import re
import shutil
import sys
import zipfile
from xml.sax.saxutils import escape

SHEET = "xl/worksheets/sheet1.xml"
STRINGS = "xl/sharedStrings.xml"

# id -> (status, notes). Only cases verified to have changed.
UPDATES = {
    "W1": ("Pass",
           "Calendar year-grid fixed: the grid used auto-fill and rendered 12 months across 5 ragged "
           "columns, and empty months stretched to full row height. Now a 4x3 quarter layout "
           "(3/2/1 at narrower widths) with compact empty months. Verified at 1440/900/480 in both "
           "AR/RTL and EN/LTR, no horizontal overflow, no console errors."),
    "C1": ("Pass",
           "List/grid toggle and year navigation verified working: 12 month cells, 34 events, year "
           "buttons plus 'All years'. Grid layout defect behind the earlier Fail is fixed. "
           "Verified in both languages."),
    "R1": ("Pass",
           "Athlete registration submits and is stored: POST /api/registrations returned a reference "
           "number (SMF-A-YYYY-NNNNN) and the record was retrievable from the admin queue with its "
           "payload and status. Verified on a local instance."),
    "R2": ("Pass",
           "All four types submit and store correctly, each with its own reference prefix: athlete "
           "(SMF-A), coach (SMF-T), referee (SMF-O), club (SMF-C). Each appears in the admin queue "
           "under the right type. Type-specific rules are enforced - referee grade, refereeing start "
           "date and tournament history for referees; applicant role, facility type, owner and head "
           "coach for clubs."),
    "R3": ("Pass",
           "Submitted applications appear in the admin review queue with applicant name, contact, "
           "type, status, approval stage and their uploaded documents. The list projection "
           "deliberately omits the full payload so national ID, date of birth and guardian details "
           "are only loaded when a reviewer opens the record, and that access is itself audited."),
    "R4": ("Pass",
           "Full chain verified against the admin console: new -> under review -> awaiting completion "
           "-> under review -> awaiting approval -> approved, plus suspend/reinstate and renewal. "
           "Illegal transitions are refused with 400 (e.g. new -> approved directly) and each status "
           "requiring a reason is refused with 400 when it is missing. Verified on a local instance; "
           "re-run on the deployed environment when access is provided."),
    "R5": ("Pass",
           "Email and SMS are sent on every lifecycle event: submission (with reference number), "
           "completion request, acceptance, rejection (with reason), renewal, expiry, and "
           "suspension/cancellation. Verified via the outbox: 6 emails + 5 SMS across one request's "
           "lifecycle, Arabic rendered correctly with placeholders substituted. No SMTP or SMS "
           "gateway is configured yet, so messages are written to the outbox rather than delivered - "
           "that is configuration, not code."),
    "R9": ("Pass",
           "Server-side re-validation confirmed: posting directly to the API with client-valid data "
           "was rejected with 400 and per-field bilingual errors (required name parts, document type, "
           "age band, phone format). The admin edit endpoint re-validates with the same rules, so a "
           "correction cannot introduce data the public form would refuse."),
    "P6": ("Pass",
           "Audit trail implemented and verified: actor, role, action, from/to status, timestamp and "
           "reason are recorded for every status change, edit, renewal, suspension, expiry, export, "
           "attachment view and deletion - including refused attempts (permission_denied). Entries "
           "are append-only and commit in the same transaction as the change they describe. Reasons "
           "are stored but field values are not, so the trail names what changed without copying "
           "applicant PII."),
    "P8": ("Pass",
           "Audited across 6 pages (home, calendar, results archive, contact, registration, news) "
           "against WCAG AA. Fixed: the selected view toggle on the results archive rendered white "
           "text on a white background (a specificity clash made the label invisible); section "
           "subtitles site-wide were 2.54:1; the IFMA source chip 2.93:1; gold and bronze medal "
           "badges 2.63:1 and 3.1:1. All now meet 4.5:1. Redundant unnamed image links removed from "
           "the accessibility tree. Verified clean: lang/dir set, one h1 per page with no skipped "
           "levels, <main> landmark, skip-to-content link, all images have alt, all form controls "
           "labelled, focus visible."),
}


def load(path):
    with zipfile.ZipFile(path) as z:
        return {name: z.read(name) for name in z.namelist()}, list(z.namelist())


def row_ids(sheet_xml, strings):
    """Maps the case id in column A to its row number."""
    ids = {}
    for row in re.finditer(r'<row r="(\d+)".*?</row>', sheet_xml, re.S):
        n, body = row.group(1), row.group(0)
        cell = re.search(r'<c r="A' + n + r'"[^>]*t="s"[^>]*><v>(\d+)</v></c>', body)
        if cell:
            ids[strings[int(cell.group(1))]] = int(n)
    return ids


def main(path):
    shutil.copy2(path, path + ".bak")
    parts, order = load(path)

    sheet = parts[SHEET].decode("utf-8")
    sst = parts[STRINGS].decode("utf-8")

    strings = re.findall(r"<si>(?:<t[^>]*>(.*?)</t>)?.*?</si>", sst, re.S)
    strings = [s if s is not None else "" for s in strings]

    ids = row_ids(sheet, strings)
    missing = [k for k in UPDATES if k not in ids]
    if missing:
        print("  case ids not found:", missing)
        return 1

    additions = []
    next_index = len(strings)

    for case, (status, notes) in UPDATES.items():
        row = ids[case]
        for col, value in (("G", status), ("H", notes)):
            additions.append(value)
            index = next_index
            next_index += 1

            ref = col + str(row)

            # Repoint the cell, preserving its style attributes.
            pattern = r'(<c r="' + ref + r'"[^>]*?)( t="s")?(>)<v>\d+</v></c>'
            replacement = r'\1 t="s"\3<v>' + str(index) + r"</v></c>"
            sheet, n = re.subn(pattern, replacement, sheet, count=1)

            if n == 0:
                # A blank cell is simply absent from the XML — a case with no
                # notes has no <c r="H…"> element at all — so it is appended to
                # its row, which is where column H belongs.
                cell = '<c r="' + ref + '" t="s"><v>' + str(index) + "</v></c>"
                row_pattern = r'(<row r="' + str(row) + r'"[^>]*>.*?)(</row>)'
                sheet, n = re.subn(row_pattern, r"\1" + cell + r"\2", sheet, count=1, flags=re.S)

            if n != 1:
                print(f"  could not update {ref} for {case}")
                return 1

    # Append the new strings and correct the counts on <sst>.
    new_si = "".join(
        '<si><t xml:space="preserve">' + escape(v) + "</t></si>" for v in additions
    )
    sst = sst.replace("</sst>", new_si + "</sst>")

    total = len(re.findall(r"<si>", sst))
    sst = re.sub(r'(<sst[^>]*?)count="\d+"', r'\1count="%d"' % total, sst, count=1)
    sst = re.sub(r'(<sst[^>]*?)uniqueCount="\d+"', r'\1uniqueCount="%d"' % total, sst, count=1)

    parts[SHEET] = sheet.encode("utf-8")
    parts[STRINGS] = sst.encode("utf-8")

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name in order:
            z.writestr(name, parts[name])

    print(f"  updated {len(UPDATES)} case(s): {', '.join(sorted(UPDATES))}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
