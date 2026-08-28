namespace Smf.Api.Data.Models;

public class Registration
{
    public int Id { get; set; }

    /// <summary>athlete | club | coach | official — see <see cref="MembershipTracks"/>.</summary>
    public string Type { get; set; } = "athlete";
    public string PayloadJson { get; set; } = "{}";
    public string ReferenceNumber { get; set; } = string.Empty;

    /// <summary>One of <see cref="RegistrationStatuses"/>.</summary>
    public string Status { get; set; } = RegistrationStatuses.New;

    /// <summary>
    /// Shown to the applicant when the request is rejected, and used as the
    /// list of missing items when more data or attachments are requested.
    /// </summary>
    public string? StatusReason { get; set; }

    /// <summary>Internal federation notes on the request or its documents.</summary>
    public string? InternalNotes { get; set; }

    /// <summary>Membership/accreditation number issued once approved.</summary>
    public string? MembershipNumber { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StatusChangedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }

    // ── Phase 2 membership lifecycle ────────────────────────────────────────
    // §1: مدة العضوية ثلاث سنوات، ودورية التجديد كل 3 سنوات.

    /// <summary>
    /// End of the three-year term, set from <see cref="ApprovedAt"/> on approval
    /// and pushed forward on renewal. Null until the membership is approved.
    /// </summary>
    public DateTime? ExpiresAt { get; set; }

    /// <summary>When the membership was last renewed.</summary>
    public DateTime? RenewedAt { get; set; }

    /// <summary>How many times the three-year term has been renewed.</summary>
    public int RenewalCount { get; set; }

    /// <summary>
    /// مهلة استكمال الطلب الناقص — when the applicant's window to supply
    /// missing items closes. Set when the status becomes
    /// <see cref="RegistrationStatuses.AwaitingCompletion"/> and cleared once
    /// they respond.
    /// </summary>
    public DateTime? CompletionDueAt { get; set; }

    /// <summary>
    /// Which stage of the track's chain the request currently sits at
    /// (1-based, matching <see cref="MembershipTracks.Stage.Order"/>).
    /// </summary>
    public int StageOrder { get; set; } = 1;

    /// <summary>When the membership was suspended, if it is.</summary>
    public DateTime? SuspendedAt { get; set; }

    /// <summary>Username of whoever last changed the status — see the audit log for the full trail.</summary>
    public string? LastActionBy { get; set; }

    /// <summary>
    /// إعادة التقديم بعد الرفض — the earlier rejected request this one replaces.
    /// A rejection is terminal, so re-applying creates a fresh request; this
    /// keeps the two linked so reviewers can see the history.
    /// </summary>
    public int? SupersedesId { get; set; }

    /// <summary>
    /// When the "your membership is about to expire" notice was last sent, so
    /// the daily sweep warns each member once per term rather than every day.
    /// Cleared on renewal, which starts a fresh term and a fresh warning.
    /// </summary>
    public DateTime? RenewalReminderSentAt { get; set; }

    /// <summary>
    /// When the completion reminder was last sent, for the same reason. Cleared
    /// whenever a new completion request opens a new window.
    /// </summary>
    public DateTime? CompletionReminderSentAt { get; set; }

    /// <summary>True once the term has elapsed, whatever the stored status says.</summary>
    public bool IsExpired(DateTime asOf) => ExpiresAt is { } expiry && expiry <= asOf;
}
