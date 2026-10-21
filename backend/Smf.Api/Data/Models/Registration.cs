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
    // مدة العضوية سنة واحدة لجميع الفئات، ودورية التجديد كل سنة (BUG-12).

    /// <summary>
    /// End of the membership term, set from <see cref="ApprovedAt"/> on approval
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

    /// <summary>
    /// The unguessable part of this membership's public card link (ISSUE-03).
    ///
    /// Issued on approval and kept across renewals, so a printed card stays
    /// valid for as long as the membership does. Regenerating it revokes every
    /// copy of the old link, which is the only way to take a card back.
    /// </summary>
    public string? CardToken { get; set; }

    /// <summary>
    /// True once the term has elapsed, or once the membership has been marked
    /// expired outright.
    ///
    /// BUG-12 — this used to look only at the date, so a membership an
    /// administrator had set to Expired still reported itself as live, with a
    /// cheerful count of days remaining on a term that no longer applied.
    /// </summary>
    public bool IsExpired(DateTime asOf) =>
        Status == RegistrationStatuses.Expired || (ExpiresAt is { } expiry && expiry <= asOf);

    /// <summary>
    /// Days left on the term: zero once it is over, never a negative number.
    /// Null when no term has been set, which is not the same as "none left".
    /// </summary>
    public int? DaysRemaining(DateTime asOf)
    {
        if (ExpiresAt is not { } expiry) return null;
        if (IsExpired(asOf)) return 0;
        return Math.Max(0, (int)Math.Ceiling((expiry - asOf).TotalDays));
    }
}
