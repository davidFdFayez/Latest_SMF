namespace Smf.Api.Data.Models;

/// <summary>
/// A medical suspension — Phase 3 REQ-03 rule 3: an athlete carrying an active
/// one cannot enter a tournament until it ends.
///
/// A knockout or a stoppage on head blows carries a mandatory rest period in
/// every combat sport, and entering during it is the one eligibility failure
/// that is about the athlete's safety rather than their paperwork.
///
/// Part 1 has these entered by the technical team. Part 2 produces them
/// automatically from a bout result, which is why <see cref="SourceBoutId"/>
/// is here now and left null until then.
/// </summary>
public class MedicalSuspension
{
    public int Id { get; set; }

    public int AthleteRegistrationId { get; set; }
    public Registration? AthleteRegistration { get; set; }

    /// <summary>KO or RSC-H, the two the document names.</summary>
    public string Reason { get; set; } = SuspensionReasons.Ko;

    public DateTime StartsOn { get; set; }

    /// <summary>
    /// The last day of the suspension. An open-ended one — pending a specialist
    /// opinion, say — leaves this null and blocks entry until it is set.
    /// </summary>
    public DateTime? EndsOn { get; set; }

    public string? Notes { get; set; }

    /// <summary>The bout that caused it, once Part 2 can tell us.</summary>
    public int? SourceBoutId { get; set; }

    /// <summary>Set when the suspension is lifted early, with who did it.</summary>
    public DateTime? LiftedAt { get; set; }
    public string? LiftedBy { get; set; }
    public string? LiftedReason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? CreatedBy { get; set; }

    /// <summary>
    /// In force on a given day. A suspension with no end date stays in force
    /// until somebody lifts it — that is the safe way round.
    /// </summary>
    public bool IsActive(DateTime asOf) =>
        LiftedAt is null
        && StartsOn.Date <= asOf.Date
        && (EndsOn is null || EndsOn.Value.Date >= asOf.Date);
}

public static class SuspensionReasons
{
    public const string Ko = "ko";
    public const string RscH = "rsc_h";
    public const string Other = "other";

    public static readonly IReadOnlyDictionary<string, (string Ar, string En)> Labels =
        new Dictionary<string, (string, string)>
        {
            [Ko] = ("الإيقاف بعد KO", "Suspension after a KO"),
            [RscH] = ("الإيقاف بعد RSC-H", "Suspension after an RSC-H"),
            [Other] = ("إيقاف طبي آخر", "Other medical suspension"),
        };
}
