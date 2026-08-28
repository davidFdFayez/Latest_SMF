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

    /// <summary>
    /// The athlete's name in Arabic, from the federation's national-team
    /// participations record. Empty where that record has no counterpart or
    /// its spelling is unconfirmed; the archive then shows the English name.
    /// </summary>
    public string AthleteAr { get; set; } = string.Empty;

    /// <summary>The championship name in Arabic. Empty falls back to <see cref="Event"/>.</summary>
    public string EventAr { get; set; } = string.Empty;

    /// <summary>gold | silver | bronze</summary>
    public string Medal { get; set; } = string.Empty;
}
