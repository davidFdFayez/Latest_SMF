namespace Smf.Api.Data.Models;

public class EventItem
{
    public int Id { get; set; }
    public string TitleAr { get; set; } = string.Empty;
    public string TitleEn { get; set; } = string.Empty;
    public string DescriptionAr { get; set; } = string.Empty;
    public string DescriptionEn { get; set; } = string.Empty;

    /// <summary>community | regional | international | camp | workshop</summary>
    public string Category { get; set; } = "community";
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public string LocationAr { get; set; } = string.Empty;
    public string LocationEn { get; set; } = string.Empty;

    /// <summary>confirmed | tentative | completed</summary>
    public string Status { get; set; } = "confirmed";
    public bool IsPublished { get; set; } = true;
}
