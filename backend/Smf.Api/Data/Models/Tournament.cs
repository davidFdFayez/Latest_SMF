namespace Smf.Api.Data.Models;

/// <summary>
/// A tournament — Phase 3 REQ-01.
///
/// Created and configured by an authorised user, then published, at which point
/// it becomes open for entries. Everything downstream hangs off this: the
/// divisions athletes enter, the draws made per division, and the bouts those
/// draws produce.
/// </summary>
public class Tournament
{
    public int Id { get; set; }

    public string NameAr { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;

    /// <summary>
    /// Kingdom, regional or local — and whatever the federation adds later.
    /// REQ-01 rule 2 makes the list extensible, so this is a free string
    /// validated against <see cref="TournamentTypes"/> rather than an enum.
    /// </summary>
    public string Type { get; set; } = TournamentTypes.Local;

    /// <summary>Muaythai Combat / Full Contact, and anything added (REQ-01 rule 3).</summary>
    public string CompetitionType { get; set; } = TournamentCompetitionTypes.Combat;

    public string LocationAr { get; set; } = string.Empty;
    public string LocationEn { get; set; } = string.Empty;

    /// <summary>First and last day of competition. A single-day tournament has both the same.</summary>
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }

    /// <summary>When the first bouts begin, as a time of day (REQ-01 rule 1).</summary>
    public TimeSpan FirstBoutTime { get; set; } = new(17, 0, 0);

    /// <summary>
    /// When entries close.
    /// </summary>
    /// <remarks>
    /// REQ-01 rule 9 — seven days before the tournament by default, and an
    /// authorised user may extend it. Stored rather than computed so that an
    /// extension survives a change to the default.
    /// </remarks>
    public DateTime RegistrationClosesAt { get; set; }

    /// <summary>REQ-01 rule 9 — the default gap, kept so the UI can explain itself.</summary>
    public const int DefaultRegistrationCloseDays = 7;

    public string Status { get; set; } = TournamentStatuses.Draft;

    /// <summary>
    /// REQ-01 rule 11 — publishing is what opens entries. Null until then.
    /// </summary>
    public DateTime? PublishedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public string? CreatedBy { get; set; }
    public string? LastActionBy { get; set; }

    /// <summary>
    /// The genders this tournament runs (REQ-01 rule 5), comma separated:
    /// <c>male</c>, <c>female</c>, or both.
    /// </summary>
    public string Genders { get; set; } = "male,female";

    /// <summary>
    /// The age categories this tournament runs (REQ-01 rule 4), comma
    /// separated values from <see cref="CompetitionCategories"/>. Multiple
    /// selection is the normal case.
    /// </summary>
    public string Categories { get; set; } = string.Empty;

    /// <summary>
    /// Which weight classes this tournament runs, per category and gender
    /// (REQ-01 rule 6), as JSON of "category:gender" to the chosen upper
    /// limits. Null means every class those categories offer.
    /// </summary>
    public string? WeightClassesJson { get; set; }

    /// <summary>
    /// Rings are deliberately not set here. REQ-01 rule 8 defers them to
    /// scheduling, once the draw shows how many bouts there actually are.
    /// </summary>
    public ICollection<TournamentRing> Rings { get; set; } = [];

    public ICollection<TournamentDivision> Divisions { get; set; } = [];

    /// <summary>True while entries are open: published, and not yet past the closing date.</summary>
    public bool IsRegistrationOpen(DateTime asOf) =>
        Status == TournamentStatuses.Published
        && PublishedAt is not null
        && RegistrationClosesAt > asOf;

    /// <summary>Every day of competition, which the schedule distributes bouts across.</summary>
    public IReadOnlyList<DateTime> Days()
    {
        var days = new List<DateTime>();
        for (var day = StartDate.Date; day <= EndDate.Date; day = day.AddDays(1)) days.Add(day);
        return days;
    }
}

/// <summary>REQ-01 rule 2 — a starting list the federation can add to.</summary>
public static class TournamentTypes
{
    public const string Kingdom = "kingdom";
    public const string Regional = "regional";
    public const string Local = "local";

    public static readonly IReadOnlyList<(string Value, string Ar, string En)> Seed =
    [
        (Kingdom, "بطولة المملكة / الوطنية", "Kingdom / national championship"),
        (Regional, "بطولة إقليمية", "Regional championship"),
        (Local, "بطولة محلية", "Local championship"),
    ];
}

/// <summary>REQ-01 rule 3 — likewise extensible.</summary>
public static class TournamentCompetitionTypes
{
    public const string Combat = "muaythai_combat";
    public const string FullContact = "full_contact";

    public static readonly IReadOnlyList<(string Value, string Ar, string En)> Seed =
    [
        (Combat, "مواي تاي قتالي", "Muaythai Combat"),
        (FullContact, "الاحتكاك الكامل", "Full Contact"),
    ];
}

public static class TournamentStatuses
{
    /// <summary>Being set up. Not visible, not open for entries.</summary>
    public const string Draft = "draft";

    /// <summary>Published — open for entries until the closing date (REQ-01 rule 11).</summary>
    public const string Published = "published";

    /// <summary>Entries closed; check-in, weigh-in and the draw happen here.</summary>
    public const string Closed = "closed";

    /// <summary>Bouts are being run.</summary>
    public const string Running = "running";

    public const string Completed = "completed";
    public const string Cancelled = "cancelled";

    public static readonly IReadOnlyList<string> All =
        [Draft, Published, Closed, Running, Completed, Cancelled];

    public static readonly IReadOnlyDictionary<string, (string Ar, string En)> Labels =
        new Dictionary<string, (string, string)>
        {
            [Draft] = ("مسودة", "Draft"),
            [Published] = ("منشورة", "Published"),
            [Closed] = ("مغلقة للتسجيل", "Registration closed"),
            [Running] = ("جارية", "Running"),
            [Completed] = ("منتهية", "Completed"),
            [Cancelled] = ("ملغاة", "Cancelled"),
        };
}
