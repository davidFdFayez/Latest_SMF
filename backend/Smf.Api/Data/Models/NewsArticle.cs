namespace Smf.Api.Data.Models;

public class NewsArticle
{
    public int Id { get; set; }
    public string TitleAr { get; set; } = string.Empty;
    public string TitleEn { get; set; } = string.Empty;
    public string SummaryAr { get; set; } = string.Empty;
    public string SummaryEn { get; set; } = string.Empty;
    public string BodyAr { get; set; } = string.Empty;
    public string BodyEn { get; set; } = string.Empty;
    public string Category { get; set; } = "news";
    public string? ImageUrl { get; set; }

    /// <summary>
    /// Where the subject of the image is, as CSS <c>object-position</c>
    /// percentages — "50 30" means halfway across and a third of the way down.
    ///
    /// Card thumbnails are a fixed 16/9 window, so a tall photo has to lose
    /// something. Until now every card lost the same thing: the top and bottom
    /// thirds, which is where heads usually are. The editor now points at the
    /// subject and the crop keeps it. Empty means the old default.
    /// </summary>
    public string? ImageFocus { get; set; }
    public DateTime PublishedAt { get; set; } = DateTime.UtcNow;
    public bool IsPublished { get; set; } = true;

    /// <summary>SMF (originally authored) or IFMA (syndicated from the international federation)</summary>
    public string Source { get; set; } = "SMF";
    public string? ExternalUrl { get; set; }
}
