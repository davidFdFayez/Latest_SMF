using Smf.Api.Services;

namespace Smf.Tests;

/// <summary>
/// The cleaning of a tournament's Terms &amp; Conditions: the formatting the
/// editor produces survives exactly, and nothing that could run does.
/// </summary>
public static class RichTextTests
{
    public static int Run()
    {
        var failures = new List<string>();

        void Check(string name, bool ok, string detail = "")
        {
            Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail.Length > 0 ? " - " + detail : ""));
            if (!ok) failures.Add(name);
        }

        void Same(string name, string input, string expected)
        {
            var actual = RichText.Sanitize(input);
            Check(name, actual == expected, actual == expected ? "" : $"got [{actual}] expected [{expected}]");
        }

        // Safe: every tag left is an allowed one, rebuilt with only the allowed
        // attributes — whatever else was there is gone or is now plain text.
        var allowedTag = new System.Text.RegularExpressions.Regex(
            "^</?(p|br|h2|h3|h4|strong|em|u|ol|ul|li)( style=\"text-align: (left|right|center|justify|start|end)\")?( dir=\"(rtl|ltr|auto)\")?>$");
        void Safe(string name, string input)
        {
            var actual = RichText.Sanitize(input);
            var tags = System.Text.RegularExpressions.Regex.Matches(actual, "<[^>]*>").Select(m => m.Value).ToList();
            var bad = tags.Where(t => !allowedTag.IsMatch(t)).ToList();
            Check(name, bad.Count == 0, bad.Count == 0 ? $"[{actual}]" : $"kept {string.Join(" ", bad)}");
        }

        /* ── what the editor writes comes back unchanged ──────────────────── */
        Same("paragraphs, bold, italic, underline",
            "<p>Hello <strong>bold</strong> <em>it</em> <u>under</u></p><p>Second</p>",
            "<p>Hello <strong>bold</strong> <em>it</em> <u>under</u></p><p>Second</p>");
        Same("headings h2–h4",
            "<h2>One</h2><h3>Two</h3><h4>Three</h4>", "<h2>One</h2><h3>Two</h3><h4>Three</h4>");
        Same("numbered and bulleted lists, with the editor's paragraphs inside",
            "<ol><li><p>First</p></li><li><p>Second</p></li></ol><ul><li><p>Dot</p></li></ul>",
            "<ol><li><p>First</p></li><li><p>Second</p></li></ol><ul><li><p>Dot</p></li></ul>");
        Same("line breaks", "<p>a<br>b<br/>c</p>", "<p>a<br>b<br>c</p>");
        Same("alignment kept, other styling dropped",
            "<p style=\"text-align: center; color: red; background:url(x)\">c</p><h2 style='text-align:right'>r</h2>",
            "<p style=\"text-align: center\">c</p><h2 style=\"text-align: right\">r</h2>");
        Same("dir kept when valid", "<p dir=\"rtl\">نص</p><p dir=\"evil\">x</p>", "<p dir=\"rtl\">نص</p><p>x</p>");
        Same("Arabic text and entities untouched", "<p>الشروط &amp; الأحكام &lt;مهم&gt;</p>", "<p>الشروط &amp; الأحكام &lt;مهم&gt;</p>");
        Same("b and i become strong and em; h1 becomes h2", "<h1>T</h1><p><b>B</b><i>I</i></p>", "<h2>T</h2><p><strong>B</strong><em>I</em></p>");

        /* ── nothing executable survives ──────────────────────────────────── */
        Same("script removed with its content", "<p>a</p><script>alert(1)</script><p>b</p>", "<p>a</p><p>b</p>");
        Same("event handlers removed", "<p onclick=\"alert(1)\" onmouseover=x>t</p>", "<p>t</p>");
        Same("links and images removed, text kept", "<p><a href=\"javascript:alert(1)\">click</a><img src=x onerror=alert(1)></p>", "<p>click</p>");
        Safe("svg payload", "<svg onload=alert(1)><circle/></svg><p>x</p>");
        Safe("iframe srcdoc", "<iframe srcdoc=\"<script>alert(1)</script>\"></iframe>");
        Safe("style element", "<style>body{display:none}</style><p>x</p>");
        Safe("unclosed script", "<p>x</p><script>alert(1)");
        Safe("mixed-case tags", "<ScRiPt>alert(1)</sCrIpT><IMG SRC=x OnErRoR=alert(1)>");
        Safe("quote tricks in attributes", "<p title='a>b' onclick=\"x\">t</p><p \"onclick=alert(1)\">u</p>");
        Safe("broken tag", "<p>a</p><img src=x onerror=alert(1)//");
        Safe("comment hiding a script", "<!--<script>alert(1)</script>--><p>ok</p>");
        Safe("form controls", "<form><input value=x><textarea>y</textarea></form><p>z</p>");
        Same("stray brackets escaped", "<p>1 < 2 > 0</p>", "<p>1 &lt; 2 &gt; 0</p>");
        Same("style attribute on inline element dropped", "<strong style=\"text-align:center\" onclick=x>s</strong>", "<strong>s</strong>");

        /* ── empty means empty ────────────────────────────────────────────── */
        Same("null", null!, "");
        Same("editor's empty paragraph", "<p></p>", "");
        Same("only breaks and spaces", "<p><br></p><p> </p>", "");
        Same("empty list", "<ul><li><p></p></li></ul>", "");
        Same("only a script", "<script>alert(1)</script>", "");

        return failures.Count;
    }
}
