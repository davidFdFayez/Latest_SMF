namespace Smf.Api.Data.Models;

/// <summary>
/// One athlete entered in one tournament — Phase 3 REQ-03, and the record that
/// check-in, the medical examination and the weigh-in all write to (REQ-08,
/// REQ-09).
///
/// An athlete may enter several tournaments, in a different division each time,
/// but only one division within a tournament (REQ-03 rules 11 and 12).
/// </summary>
public class TournamentEntry
{
    public int Id { get; set; }

    public int TournamentId { get; set; }
    public Tournament? Tournament { get; set; }

    /// <summary>
    /// Null until the weight class is settled. An entry exists before its
    /// division does — the athlete picks a weight class at entry, but the
    /// weigh-in may move them (REQ-09 rule 4).
    /// </summary>
    public int? DivisionId { get; set; }
    public TournamentDivision? Division { get; set; }

    /// <summary>
    /// The athlete's membership record. Entry requires an active one
    /// (REQ-03 rule 2), so this is the link that proves it.
    /// </summary>
    public int AthleteRegistrationId { get; set; }
    public Registration? AthleteRegistration { get; set; }

    /// <summary>Who entered them (REQ-03 rule 1): the athlete, their club, or their coach.</summary>
    public string EnteredBy { get; set; } = EntrySources.Athlete;
    public string? EnteredByName { get; set; }

    /// <summary>The track the athlete competes in — one only (REQ-02 rule 3).</summary>
    public string Track { get; set; } = string.Empty;

    /// <summary>The category they entered, which may be changed by the technical team (REQ-03 rule 7).</summary>
    public string Category { get; set; } = string.Empty;

    /// <summary>What they declared at entry; the weigh-in records what they actually are.</summary>
    public decimal? DeclaredWeightKg { get; set; }
    public decimal? HeightCm { get; set; }

    /// <summary>REQ-03 rule 8 — captured at entry, pre-filled from the account where known.</summary>
    public string? ClubName { get; set; }
    public string? TrainingCentre { get; set; }
    public string? CoachName { get; set; }
    public string? CoachPhone { get; set; }

    public string Status { get; set; } = EntryStatuses.Registered;

    /* ── readiness: check-in, medical examination, weigh-in ─────────────── */

    /// <summary>REQ-08 rule 4.</summary>
    public DateTime? CheckedInAt { get; set; }
    public string? CheckedInBy { get; set; }

    /// <summary>REQ-08 rule 5 — passed or failed, recorded by the technical team.</summary>
    public string? MedicalResult { get; set; }
    public DateTime? MedicalRecordedAt { get; set; }
    public string? MedicalRecordedBy { get; set; }

    /// <summary>
    /// REQ-08 rule 6 — a pass may be given with documents still missing, but
    /// only with a reason, and the technical team owns the decision.
    /// </summary>
    public string? MedicalNote { get; set; }

    /// <summary>REQ-09 rule 1 — entered by hand before the tournament.</summary>
    public decimal? ActualWeightKg { get; set; }
    public string? WeighInResult { get; set; }
    public DateTime? WeighInAt { get; set; }
    public string? WeighInBy { get; set; }

    /// <summary>
    /// REQ-09 rule 7 — after all three are passed the athlete goes to the
    /// technical director, and only approval puts them in the qualified pool
    /// the draw is made from.
    /// </summary>
    public DateTime? QualifiedAt { get; set; }
    public string? QualifiedBy { get; set; }

    /// <summary>Why an entry was withdrawn, failed or disqualified.</summary>
    public string? StatusReason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// Ready for the draw: checked in, passed the examination and the weigh-in,
    /// and approved (REQ-09 rule 7).
    /// </summary>
    public bool IsQualified =>
        Status == EntryStatuses.Qualified
        && QualifiedAt is not null
        && MedicalResult == ReadinessResults.Passed
        && WeighInResult == ReadinessResults.Passed;
}

public static class EntrySources
{
    public const string Athlete = "athlete";
    public const string Club = "club";
    public const string Coach = "coach";
    public const string Admin = "admin";
}

public static class ReadinessResults
{
    public const string Passed = "passed";
    public const string Failed = "failed";
}

public static class EntryStatuses
{
    /// <summary>Entered, nothing checked yet.</summary>
    public const string Registered = "registered";

    /// <summary>Checked in on the day, awaiting examination or weigh-in.</summary>
    public const string CheckedIn = "checked_in";

    /// <summary>Through all three and approved — in the pool the draw uses.</summary>
    public const string Qualified = "qualified";

    /// <summary>Failed the examination or the weigh-in (REQ-08 rule 7, REQ-09 rule 5).</summary>
    public const string NotEligible = "not_eligible";

    /// <summary>Did not appear at the weigh-in (REQ-09 rule 6).</summary>
    public const string Disqualified = "disqualified";

    /// <summary>Pulled out. Before the draw they leave the division; after it the opponent walks over.</summary>
    public const string Withdrawn = "withdrawn";

    public static readonly IReadOnlyList<string> All =
        [Registered, CheckedIn, Qualified, NotEligible, Disqualified, Withdrawn];

    public static readonly IReadOnlyDictionary<string, (string Ar, string En)> Labels =
        new Dictionary<string, (string, string)>
        {
            [Registered] = ("مسجل", "Registered"),
            [CheckedIn] = ("تم تسجيل الحضور", "Checked in"),
            [Qualified] = ("مؤهل للقرعة", "Qualified"),
            [NotEligible] = ("غير مؤهل", "Not eligible"),
            [Disqualified] = ("مستبعد", "Disqualified"),
            [Withdrawn] = ("منسحب", "Withdrawn"),
        };
}
