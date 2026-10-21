namespace Smf.Api.Data;

/// <summary>
/// Competition categories, the ages that may enter them, and the three tracks
/// they belong to.
///
/// Eligibility age is <b>the competition year minus the birth year</b>, not the
/// athlete's age on the day (Phase 3 REQ-02 rule 1, and the Phase 2 eligibility
/// rules before it). That is how a draw is seeded: everyone born in the same
/// year competes together, so a December birthday does not drop a child into
/// the band below for half the season.
///
/// Masters is three categories, not one. Phase 2 listed nine options with a
/// single Masters covering 35–50; the signed Phase 3 document lists eleven,
/// splitting it into 35+, 40+ and 45+. That document is newer, so it wins —
/// <see cref="Normalise"/> maps the old stored value onto the right band.
///
/// Para is deliberately absent: it is a declaration an athlete makes on its own
/// field, not an age category.
///
/// This mirrors COMPETITION_CATEGORIES in web/src/data/registrationPortal.js. A
/// change to one is a change to both.
/// </summary>
public static class CompetitionCategories
{
    /// <summary>
    /// The three paths through a tournament. REQ-02 rule 3: an athlete competes
    /// in one of them only, even when their age opens more than one.
    /// </summary>
    public static class Tracks
    {
        public const string Development = "development";
        public const string Elite = "elite";
        public const string Masters = "masters";

        public static (string Ar, string En) Label(string track) => track switch
        {
            Development => ("مسار التطوير", "Development"),
            Elite => ("النخبة", "Elite"),
            Masters => ("الماسترز", "Masters"),
            _ => (track, track),
        };
    }

    public record Category(string Value, string Ar, string En, int MinAge, int MaxAge, string Track);

    public static readonly IReadOnlyList<Category> All =
    [
        new("u8", "تحت 8 سنوات", "U8", 6, 7, Tracks.Development),
        new("u10", "تحت 10 سنوات", "U10", 8, 9, Tracks.Development),
        new("u12", "تحت 12 سنة", "U12", 10, 11, Tracks.Development),
        new("u14", "تحت 14 سنة", "U14", 12, 13, Tracks.Development),
        new("u16", "تحت 16 سنة", "U16", 14, 15, Tracks.Development),
        new("u18", "تحت 18 سنة", "U18", 16, 17, Tracks.Development),
        new("u24", "تحت 24 سنة", "U24", 18, 23, Tracks.Development),
        new("elite", "النخبة", "Elite", 18, 40, Tracks.Elite),
        new("masters_35", "ماسترز +35", "Masters 35+", 35, 39, Tracks.Masters),
        new("masters_40", "ماسترز +40", "Masters 40+", 40, 44, Tracks.Masters),
        new("masters_45", "ماسترز +45", "Masters 45+", 45, 50, Tracks.Masters),
    ];

    /// <summary>Youngest competition age any category admits.</summary>
    public static int MinAge => All.Min(c => c.MinAge);

    /// <summary>Oldest competition age any category admits.</summary>
    public static int MaxAge => All.Max(c => c.MaxAge);

    /// <summary>Competition year minus birth year, or null for an unreadable date.</summary>
    public static int? AgeOf(DateTime? dateOfBirth, int? competitionYear = null) =>
        dateOfBirth is { } birth ? (competitionYear ?? DateTime.UtcNow.Year) - birth.Year : null;

    /// <summary>
    /// Every category this athlete may enter.
    ///
    /// The eligibility rules close with an absolute instruction — "Athletes
    /// under 18 must never be allowed to select Elite" — so that is its own
    /// guard rather than something left to the table, where a later edit could
    /// quietly undo it.
    /// </summary>
    public static IReadOnlyList<Category> EligibleFor(DateTime? dateOfBirth, int? competitionYear = null)
    {
        if (AgeOf(dateOfBirth, competitionYear) is not { } age) return [];

        return All
            .Where(entry => age >= entry.MinAge && age <= entry.MaxAge)
            .Where(entry => entry.Value != "elite" || age >= 18)
            .ToList();
    }

    /// <summary>
    /// The tracks open to this athlete (REQ-02 rules 3 and 4). More than one
    /// means the athlete has to choose: the system shows them and takes a
    /// single answer.
    /// </summary>
    public static IReadOnlyList<string> TracksFor(DateTime? dateOfBirth, int? competitionYear = null) =>
        EligibleFor(dateOfBirth, competitionYear)
            .Select(entry => entry.Track)
            .Distinct()
            .ToList();

    /// <summary>The categories within one track that this athlete may enter.</summary>
    public static IReadOnlyList<Category> EligibleInTrack(
        DateTime? dateOfBirth,
        string track,
        int? competitionYear = null) =>
        EligibleFor(dateOfBirth, competitionYear)
            .Where(entry => entry.Track == track)
            .ToList();

    /// <summary>
    /// The category the system assigns on its own when nobody has chosen.
    ///
    /// The age-group ladder wins wherever it applies, because that is where an
    /// athlete competes by default: an 18-to-23-year-old is U24 rather than
    /// Elite, and Elite only becomes the assignment from 24. Masters takes over
    /// once Elite runs out at 41. Anyone eligible for more than one can still be
    /// moved between them by the federation after review.
    /// </summary>
    public static string? PrimaryFor(DateTime? dateOfBirth, int? competitionYear = null)
    {
        var eligible = EligibleFor(dateOfBirth, competitionYear);
        if (eligible.Count == 0) return null;

        var ladder = eligible.FirstOrDefault(entry => entry.Track == Tracks.Development);
        if (ladder is not null) return ladder.Value;

        var elite = eligible.FirstOrDefault(entry => entry.Value == "elite");
        return (elite ?? eligible[0]).Value;
    }

    /// <summary>
    /// Brings a stored value onto the current list.
    ///
    /// Phase 2 stored a single <c>masters</c>; this resolves it to the band the
    /// athlete's age actually falls in, so records written before the split keep
    /// meaning what they meant. Anything already current is returned unchanged.
    /// </summary>
    public static string? Normalise(string? stored, DateTime? dateOfBirth, int? competitionYear = null)
    {
        if (string.IsNullOrWhiteSpace(stored)) return null;
        if (All.Any(entry => entry.Value == stored)) return stored;

        if (stored == "masters")
        {
            return EligibleFor(dateOfBirth, competitionYear)
                .FirstOrDefault(entry => entry.Track == Tracks.Masters)?.Value;
        }

        return null;
    }

    /// <summary>Bilingual label for a stored value, falling back to the value itself.</summary>
    public static (string Ar, string En) Label(string? value)
    {
        var entry = All.FirstOrDefault(item => item.Value == value);
        return entry is null ? (value ?? string.Empty, value ?? string.Empty) : (entry.Ar, entry.En);
    }

    /// <summary>The track a category belongs to, or null if the value is unknown.</summary>
    public static string? TrackOf(string? value) =>
        All.FirstOrDefault(entry => entry.Value == value)?.Track;
}
