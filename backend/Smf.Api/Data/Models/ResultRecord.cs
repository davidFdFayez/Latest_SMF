namespace Smf.Api.Data.Models;

public class ResultRecord
{
    public int Id { get; set; }
    public int Year { get; set; }
    public string Athlete { get; set; } = string.Empty;
    public string AthleteSlug { get; set; } = string.Empty;
    public string Event { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;

    /// <summary>gold | silver | bronze</summary>
    public string Medal { get; set; } = string.Empty;
}
