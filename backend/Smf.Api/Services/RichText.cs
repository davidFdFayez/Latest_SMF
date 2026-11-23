using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace Smf.Api.Services;

/// <summary>
/// The rich text an administrator writes (a tournament's Terms &amp; Conditions),
/// cut down to a fixed set of harmless formatting before it is stored.
///
/// Nothing is passed through as written: every tag is either rebuilt from
/// scratch — an allowed element with only the allowed attributes — or dropped.
/// Text between tags keeps its entities, and any stray '&lt;' or '&gt;' is
/// escaped, so no markup survives that was not rebuilt here.
///
/// Allowed: p, br, h2–h4, strong/b, em/i, u, ol, ul, li — with only
/// <c>style="text-align: …"</c> and <c>dir</c> on blocks. Everything else is
/// removed; script, style and similar elements lose their content too.
/// </summary>
public static partial class RichText
{
    /// <summary>The most a stored text may hold, in characters once cleaned.</summary>
    public const int MaxLength = 100_000;

    private static readonly HashSet<string> Inline = new(StringComparer.OrdinalIgnoreCase) { "strong", "b", "em", "i", "u", "br" };
    private static readonly HashSet<string> Blocks = new(StringComparer.OrdinalIgnoreCase) { "p", "h2", "h3", "h4", "ol", "ul", "li" };

    /// <summary>Elements removed together with everything inside them.</summary>
    private static readonly HashSet<string> Dropped = new(StringComparer.OrdinalIgnoreCase)
    {
        "script", "style", "iframe", "object", "embed", "noscript", "template", "textarea",
        "select", "svg", "math", "head", "title", "xmp", "plaintext", "noembed", "noframes",
    };

    /// <summary>Headings outside h2–h4 become the nearest allowed level.</summary>
    private static string Normalise(string tag) => tag.ToLowerInvariant() switch
    {
        "b" => "strong",
        "i" => "em",
        "h1" => "h2",
        "h5" or "h6" => "h4",
        "div" => "p",
        var other => other,
    };

    [GeneratedRegex(@"<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<[!?][^>]*>?|<(/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>""']|""[^""]*""|'[^']*')*)>|<")]
    private static partial Regex Token();

    [GeneratedRegex(@"([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:""([^""]*)""|'([^']*)'|([^\s""'=<>`]+)))?")]
    private static partial Regex Attribute();

    [GeneratedRegex(@"text-align\s*:\s*(left|right|center|justify|start|end)\b", RegexOptions.IgnoreCase)]
    private static partial Regex Align();

    [GeneratedRegex(@"<(p|h2|h3|h4|li|ol|ul|strong|em|u)\b[^>]*>\s*(?:<br>\s*)*</\1>")]
    private static partial Regex EmptyElement();

    /// <summary>
    /// The cleaned text, or an empty string when nothing readable is left
    /// (an editor's empty "&lt;p&gt;&lt;/p&gt;" counts as nothing).
    /// </summary>
    public static string Sanitize(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;

        var output = new StringBuilder(html.Length);
        var position = 0;
        while (position < html.Length)
        {
            var match = Token().Match(html, position);
            if (!match.Success)
            {
                AppendText(output, html.AsSpan(position));
                break;
            }

            AppendText(output, html.AsSpan(position, match.Index - position));
            position = match.Index + match.Length;

            if (match.Value == "<")
            {
                output.Append("&lt;");
                continue;
            }
            if (!match.Groups[2].Success) continue; // a comment, CDATA, doctype or processing instruction

            var closing = match.Groups[1].Value == "/";
            var raw = match.Groups[2].Value;

            if (Dropped.Contains(raw))
            {
                if (!closing) position = SkipPast(html, position, raw);
                continue;
            }

            var tag = Normalise(raw);
            if (!Inline.Contains(tag) && !Blocks.Contains(tag)) continue;

            if (tag == "br")
            {
                output.Append("<br>");
                continue;
            }
            if (closing)
            {
                output.Append("</").Append(tag).Append('>');
                continue;
            }

            output.Append('<').Append(tag);
            if (Blocks.Contains(tag)) AppendBlockAttributes(output, match.Groups[3].Value);
            output.Append('>');
        }

        // Empty paragraphs and lists add nothing; drop them until none are left.
        var cleaned = output.ToString();
        for (var previous = string.Empty; previous != cleaned;)
        {
            previous = cleaned;
            cleaned = EmptyElement().Replace(cleaned, string.Empty);
        }

        cleaned = cleaned.Trim();
        return HasText(cleaned) ? cleaned : string.Empty;
    }

    /// <summary>True when the text, tags aside, has something to read.</summary>
    public static bool HasText(string? html) =>
        !string.IsNullOrWhiteSpace(html)
        && !string.IsNullOrWhiteSpace(WebUtility.HtmlDecode(Regex.Replace(html, "<[^>]*>", " ")));

    private static void AppendBlockAttributes(StringBuilder output, string attributes)
    {
        string? align = null;
        string? dir = null;
        foreach (Match attribute in Attribute().Matches(attributes))
        {
            var name = attribute.Groups[1].Value.ToLowerInvariant();
            var value = attribute.Groups[2].Success ? attribute.Groups[2].Value
                : attribute.Groups[3].Success ? attribute.Groups[3].Value
                : attribute.Groups[4].Value;
            value = WebUtility.HtmlDecode(value);

            if (name == "style" && Align().Match(value) is { Success: true } found)
                align = found.Groups[1].Value.ToLowerInvariant();
            else if (name == "dir" && value.Trim().ToLowerInvariant() is "rtl" or "ltr" or "auto")
                dir = value.Trim().ToLowerInvariant();
        }
        if (align is not null) output.Append(" style=\"text-align: ").Append(align).Append('"');
        if (dir is not null) output.Append(" dir=\"").Append(dir).Append('"');
    }

    /// <summary>Text keeps its entities; only angle brackets are escaped.</summary>
    private static void AppendText(StringBuilder output, ReadOnlySpan<char> text)
    {
        foreach (var c in text)
        {
            if (c == '<') output.Append("&lt;");
            else if (c == '>') output.Append("&gt;");
            else if (c != '\0') output.Append(c);
        }
    }

    /// <summary>Where the content of a dropped element ends: after its closing tag, or the end.</summary>
    private static int SkipPast(string html, int from, string tag)
    {
        var close = Regex.Match(html[from..], $@"</{Regex.Escape(tag)}\s*>", RegexOptions.IgnoreCase);
        return close.Success ? from + close.Index + close.Length : html.Length;
    }
}
