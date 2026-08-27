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
    public DateTime PublishedAt { get; set; } = DateTime.UtcNow;
    public bool IsPublished { get; set; } = true;

    /// <summary>SMF (originally authored) or IFMA (syndicated from the international federation)</summary>
    public string Source { get; set; } = "SMF";
    public string? ExternalUrl { get; set; }
}
