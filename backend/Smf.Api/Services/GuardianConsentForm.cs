using System.Text;

namespace Smf.Api.Services;

/// <summary>
/// The guardian consent an under-18 downloads, signs and uploads — Phase 3
/// REQ-04 rule 3.
///
/// The document says the system "provides a guardian consent document for
/// download", so there has to be one. It is generated per athlete rather than
/// being a static file so that the name, the tournament and the date are
/// already on it: a parent should be signing their own child's form, not a
/// blank one.
///
/// Served as HTML, which prints to a sheet of A4 from any browser and needs no
/// PDF library. For girls under 18 it carries the pregnancy declaration too,
/// as rule 3 requires.
/// </summary>
public static class GuardianConsentForm
{
    public static string Render(
        string athleteName,
        string? membershipNumber,
        string? tournamentName,
        bool includePregnancyDeclaration)
    {
        var html = new StringBuilder();

        html.Append("""
            <!doctype html>
            <html lang="ar" dir="rtl">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>موافقة ولي الأمر — الاتحاد السعودي للملاكمة التايلندية</title>
            <style>
              @page { size: A4; margin: 18mm; }
              body { font-family: "Segoe UI", Tahoma, sans-serif; line-height: 2; color: #111; }
              h1 { font-size: 18pt; text-align: center; margin: 0 0 4pt; }
              h2 { font-size: 11pt; text-align: center; font-weight: 400; color: #444; margin: 0 0 24pt; }
              .who { border: 1px solid #999; padding: 10pt 14pt; margin-block-end: 18pt; }
              .who div { display: flex; gap: 8pt; }
              .who dt { font-weight: 700; min-width: 120pt; }
              ol { padding-inline-start: 18pt; }
              li { margin-block-end: 8pt; }
              .sign { margin-block-start: 28pt; display: grid; grid-template-columns: 1fr 1fr; gap: 20pt 32pt; }
              .sign p { border-block-end: 1px solid #333; padding-block-end: 28pt; margin: 0; }
              .note { margin-block-start: 22pt; font-size: 9pt; color: #555; }
              .en { margin-block-start: 26pt; padding-block-start: 14pt; border-block-start: 1px solid #ccc;
                    direction: ltr; text-align: left; font-size: 9.5pt; color: #333; }
              @media print { .noprint { display: none; } }
            </style>
            </head>
            <body>
            <h1>إقرار وموافقة ولي الأمر</h1>
            <h2>الاتحاد السعودي للملاكمة التايلندية</h2>
            """);

        html.Append("<dl class=\"who\">");
        html.Append($"<div><dt>اسم اللاعب</dt><dd>{Escape(athleteName)}</dd></div>");
        if (!string.IsNullOrWhiteSpace(membershipNumber))
            html.Append($"<div><dt>رقم العضوية</dt><dd>{Escape(membershipNumber)}</dd></div>");
        if (!string.IsNullOrWhiteSpace(tournamentName))
            html.Append($"<div><dt>البطولة</dt><dd>{Escape(tournamentName)}</dd></div>");
        html.Append("<div><dt>اسم ولي الأمر</dt><dd>……………………………………………</dd></div>");
        html.Append("<div><dt>رقم الهوية</dt><dd>……………………………………………</dd></div>");
        html.Append("<div><dt>صلة القرابة</dt><dd>……………………………………………</dd></div>");
        html.Append("<div><dt>رقم الجوال</dt><dd>……………………………………………</dd></div>");
        html.Append("</dl>");

        html.Append("<p>بصفتي ولي أمر اللاعب المذكور أعلاه، أقرّ وأوافق على ما يلي:</p>");
        html.Append("<ol>");
        html.Append("<li><strong>المشاركة:</strong> أوافق على مشاركة اللاعب في البطولة، "
                    + "وأقرّ بعلمي بطبيعة رياضة المواي تاي وما تنطوي عليه من مخاطر، "
                    + "وألتزم نيابة عنه بقواعد الاتحاد وتعليمات المنظمين.</li>");
        html.Append("<li><strong>الموافقة الإعلامية:</strong> أوافق على تصوير اللاعب "
                    + "والبث المباشر لمشاركته واستخدام ذلك من قبل الاتحاد.</li>");
        html.Append("<li><strong>مكافحة المنشطات:</strong> أقرّ بالتزام اللاعب بقواعد "
                    + "مكافحة المنشطات وأوافق على استخدام البيانات لهذا الغرض.</li>");
        html.Append("<li><strong>صحة البيانات:</strong> أقرّ بأن جميع المعلومات والمستندات "
                    + "الطبية المقدمة عن اللاعب صحيحة.</li>");

        if (includePregnancyDeclaration)
        {
            // Rule 3 — for girls under 18 the pregnancy declaration is part of
            // this document rather than a tick box the athlete gives herself.
            html.Append("<li><strong>إقرار عدم الحمل:</strong> أقرّ بأن اللاعبة غير حامل "
                        + "في تاريخ التوقيع أدناه.</li>");
        }

        html.Append("</ol>");

        html.Append("""
            <div class="sign">
              <p>اسم ولي الأمر</p>
              <p>التوقيع</p>
              <p>التاريخ</p>
              <p>رقم الجوال</p>
            </div>
            <p class="note">
              يُوقَّع هذا النموذج ويُرفع في الملف الطبي للاعب قبل الفحص الطبي.
              عدم استكماله يمنع المشاركة في المنافسة.
            </p>
            """);

        html.Append("""
            <div class="en">
              <strong>Guardian consent — Saudi Muaythai Federation.</strong>
              As the guardian of the athlete named above, I consent to their taking part,
              acknowledge the risks of the sport, agree to the federation's rules and the
              organisers' instructions, consent to photography and broadcast, confirm the
              athlete's commitment to the anti-doping rules, and declare that the
              information and medical documents provided are correct.
              Sign and upload this form to the athlete's medical file before the medical
              examination; it has to be complete before they may compete.
            </div>
            <p class="noprint" style="text-align:center;margin-block-start:24pt">
              <button onclick="window.print()">طباعة / Print</button>
            </p>
            </body></html>
            """);

        return html.ToString();
    }

    /// <summary>The names come from an applicant's own form, so they are escaped.</summary>
    private static string Escape(string? value) => string.IsNullOrEmpty(value)
        ? string.Empty
        : value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
               .Replace("\"", "&quot;").Replace("'", "&#39;");
}
