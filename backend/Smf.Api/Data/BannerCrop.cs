using System.Globalization;

namespace Smf.Api.Data;

/// <summary>
/// Which part of a tournament banner shows inside the banner frame.
///
/// The original file is never cropped or re-encoded: this only says how the
/// page frames it. <see cref="X"/> and <see cref="Y"/> are percentages of the
/// image's overflow on each axis — 0 shows the left (or top) edge, 100 the
/// right (or bottom) edge, 50 the middle — and <see cref="Zoom"/> magnifies
/// the image beyond the size that just covers the frame, about that same point.
///
/// That is exactly what CSS draws for
/// <c>object-fit: cover; object-position: X% Y%; transform: scale(Zoom);
/// transform-origin: X% Y%</c> inside a frame that clips, so the admin
/// preview and every page render it with the same few properties, and no
/// value can ever leave an empty area: the image always covers the frame
/// before it is magnified, and magnifying never shrinks it.
///
/// Stored as "<c>X Y Zoom</c>" (for example "50 30 1.25"), readable in the
/// database and unable to carry anything but numbers into a style attribute.
/// Null — every banner from before positioning existed — means the page's own
/// default framing.
/// </summary>
public sealed record BannerCrop(double X, double Y, double Zoom)
{
    public const double MinZoom = 1;
    public const double MaxZoom = 4;

    /// <summary>
    /// The position as it is kept: X and Y clamped to 0–100 and rounded to a
    /// tenth, the zoom clamped to 1–4 and rounded to a hundredth. A value
    /// just off the edge is a rounding artefact from a drag, not an error
    /// worth failing a save over. Anything that is not a number is refused.
    /// </summary>
    public static BannerCrop? Normalise(double? x, double? y, double? zoom)
    {
        var cx = x ?? 50;
        var cy = y ?? 50;
        var cz = zoom ?? MinZoom;
        if (!double.IsFinite(cx) || !double.IsFinite(cy) || !double.IsFinite(cz)) return null;

        return new BannerCrop(
            Math.Round(Math.Clamp(cx, 0, 100), 1),
            Math.Round(Math.Clamp(cy, 0, 100), 1),
            Math.Round(Math.Clamp(cz, MinZoom, MaxZoom), 2));
    }

    /// <summary>The stored text, or null when there is nothing usable in it.</summary>
    public static BannerCrop? Parse(string? stored)
    {
        if (string.IsNullOrWhiteSpace(stored)) return null;

        var parts = stored.Split([' ', ','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 3) return null;

        var numbers = new double[3];
        for (var i = 0; i < 3; i++)
        {
            if (!double.TryParse(parts[i], NumberStyles.Float, CultureInfo.InvariantCulture, out numbers[i])) return null;
        }

        return Normalise(numbers[0], numbers[1], numbers[2]);
    }

    /// <summary>"X Y Zoom" in the invariant culture, for the database.</summary>
    public string Write() => string.Create(CultureInfo.InvariantCulture, $"{X} {Y} {Zoom}");
}
