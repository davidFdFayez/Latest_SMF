using System.Globalization;

namespace Smf.Api.Data;

/// <summary>
/// The focal point of a news image, stored as two percentages.
///
/// A card thumbnail is a fixed 16/9 window, so a photo that is not already that
/// shape has to lose something at the edges. The default guess — a little above
/// centre — is right most of the time and wrong exactly when it matters, on a
/// portrait shot where the face sits high or off to one side. The editor picks
/// the point instead, and the card crops around it.
///
/// Stored as "<c>x y</c>" (for example "50 30") so the value is readable in the
/// database and cannot carry arbitrary CSS into the page.
/// </summary>
public static class NewsImageFocus
{
    /// <summary>What a card used before anyone could choose: centred, a third down.</summary>
    public const string Default = "50% 30%";

    /// <summary>
    /// Normalises what the console sends into "<c>x y</c>", or null when it is
    /// absent or unusable. Values outside 0–100 are clamped rather than
    /// rejected: a focal point slightly off the edge is a rounding artefact
    /// from a click, not an error worth failing a save over.
    /// </summary>
    public static string? Clean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var parts = value.Replace("%", string.Empty)
            .Split([' ', ','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (parts.Length != 2) return null;
        if (!double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var x)) return null;
        if (!double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var y)) return null;

        return string.Create(CultureInfo.InvariantCulture, $"{Clamp(x)} {Clamp(y)}");
    }

    /// <summary>
    /// The value as the page needs it. Anything unreadable falls back to the
    /// default, so a hand-edited row can never put raw text into a style
    /// attribute.
    /// </summary>
    public static string Css(string? stored)
    {
        var clean = Clean(stored);
        if (clean is null) return Default;

        var parts = clean.Split(' ');
        return $"{parts[0]}% {parts[1]}%";
    }

    private static int Clamp(double value) => (int)Math.Round(Math.Clamp(value, 0, 100));
}
