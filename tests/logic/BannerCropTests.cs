using Smf.Api.Data;

namespace Smf.Tests;

/// <summary>
/// A tournament banner's position: what is kept, and what is refused. The
/// rendering is CSS (object-fit, object-position, scale), so the rules here
/// are the whole of what the server decides.
/// </summary>
public static class BannerCropTests
{
    public static int Run()
    {
        var failures = new List<string>();

        void Check(string name, bool ok, string detail = "")
        {
            Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail.Length > 0 ? " - " + detail : ""));
            if (!ok) failures.Add(name);
        }

        string Show(BannerCrop? crop) => crop is null ? "null" : crop.Write();

        var centred = BannerCrop.Normalise(50, 50, 1);
        Check("the centred default is written as \"50 50 1\"", centred?.Write() == "50 50 1", Show(centred));
        Check("missing values fall back to the centred default", BannerCrop.Normalise(null, null, null)?.Write() == "50 50 1");
        Check("x and y keep a tenth", BannerCrop.Normalise(12.345, 67.891, 1)?.Write() == "12.3 67.9 1",
            Show(BannerCrop.Normalise(12.345, 67.891, 1)));
        Check("zoom keeps a hundredth", BannerCrop.Normalise(50, 50, 1.23456)?.Zoom == 1.23);
        Check("x and y outside 0–100 are clamped, not refused",
            BannerCrop.Normalise(-5, 140, 1)?.Write() == "0 100 1", Show(BannerCrop.Normalise(-5, 140, 1)));
        Check("a zoom below 1 is raised to 1 (the image always covers the frame)",
            BannerCrop.Normalise(50, 50, 0.4)?.Zoom == 1);
        Check("a zoom above 4 is lowered to 4", BannerCrop.Normalise(50, 50, 9)?.Zoom == 4);
        Check("not-a-number is refused", BannerCrop.Normalise(double.NaN, 50, 1) is null);
        Check("infinity is refused", BannerCrop.Normalise(50, 50, double.PositiveInfinity) is null);

        Check("the stored text reads back", BannerCrop.Parse("30 70.5 2.25") == new BannerCrop(30, 70.5, 2.25));
        Check("commas are read as separators", BannerCrop.Parse("30,70,2") == new BannerCrop(30, 70, 2));
        Check("a stored value out of range is clamped on the way out", BannerCrop.Parse("120 -3 7") == new BannerCrop(100, 0, 4));
        Check("null and blank read as no position", BannerCrop.Parse(null) is null && BannerCrop.Parse("  ") is null);
        Check("two numbers are not a position", BannerCrop.Parse("50 50") is null);
        Check("four numbers are not a position", BannerCrop.Parse("1 2 3 4") is null);
        Check("text is not a position", BannerCrop.Parse("50 50 url(x)") is null);
        Check("CSS cannot ride along", BannerCrop.Parse("50%;background:red 50 1") is null);

        // Written in the invariant culture, whatever the server's own.
        var previous = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = new System.Globalization.CultureInfo("de-DE");
            var written = BannerCrop.Normalise(12.5, 40, 1.75)!.Write();
            Check("a decimal point, never a comma, under a German culture", written == "12.5 40 1.75", written);
            Check("and it reads back under that culture", BannerCrop.Parse(written) == new BannerCrop(12.5, 40, 1.75));
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = previous;
        }

        Console.WriteLine(failures.Count == 0 ? "  all banner position checks passed" : $"  {failures.Count} FAILED");
        return failures.Count;
    }
}
