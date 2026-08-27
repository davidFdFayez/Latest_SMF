namespace Smf.Api.Data;

/// <summary>
/// The registration request lifecycle defined in the federation's approved
/// content requirements (§12), extended with the two membership-lifetime states
/// the Phase 2 workflow document requires: تعليق/إلغاء and انتهاء (§6 —
/// قواعد تشغيلية مشتركة). Stored as the string value on
/// <see cref="Models.Registration.Status"/>.
/// </summary>
public static class RegistrationStatuses
{
    /// <summary>جديد — request created, not yet reviewed.</summary>
    public const string New = "new";

    /// <summary>تحت المراجعة — being checked by the federation team.</summary>
    public const string UnderReview = "under_review";

    /// <summary>بانتظار استكمال البيانات — applicant notified, awaiting missing data/attachments.</summary>
    public const string AwaitingCompletion = "awaiting_completion";

    /// <summary>بانتظار الاعتماد — review finished, awaiting sign-off.</summary>
    public const string AwaitingApproval = "awaiting_approval";

    /// <summary>معتمد — approved; the membership is active until it expires.</summary>
    public const string Approved = "approved";

    /// <summary>مرفوض — rejected; a reason must be shown.</summary>
    public const string Rejected = "rejected";

    /// <summary>ملغي — cancelled by the applicant or the administration.</summary>
    public const string Cancelled = "cancelled";

    /// <summary>منتهي — fulfilled and closed.</summary>
    public const string Completed = "completed";

    /// <summary>
    /// معلق — an approved membership suspended by an authorised administrator
    /// (§6). Reversible: it can be reinstated, unlike <see cref="Cancelled"/>.
    /// </summary>
    public const string Suspended = "suspended";

    /// <summary>
    /// منتهية الصلاحية — the three-year term elapsed without renewal (§1).
    /// Distinct from <see cref="Completed"/>, which closes a request rather
    /// than retiring a membership.
    /// </summary>
    public const string Expired = "expired";

    public static readonly string[] All =
    [
        New,
        UnderReview,
        AwaitingCompletion,
        AwaitingApproval,
        Approved,
        Rejected,
        Cancelled,
        Completed,
        Suspended,
        Expired,
    ];

    /// <summary>Statuses that still count as open work for the dashboard counter.</summary>
    public static readonly string[] Open =
    [
        New,
        UnderReview,
        AwaitingCompletion,
        AwaitingApproval,
    ];

    /// <summary>Statuses in which a membership is live and countable as active.</summary>
    public static readonly string[] Active = [Approved];

    /// <summary>
    /// Terminal states. §6 allows re-applying after a rejection, but that starts
    /// a <em>new</em> request rather than reviving the rejected one, so these
    /// accept no onward transition.
    /// </summary>
    public static readonly string[] Terminal = [Rejected, Cancelled, Completed];

    public static bool IsValid(string? status) =>
        !string.IsNullOrWhiteSpace(status) && All.Contains(status);

    /// <summary>Rejection requires a reason; completion-request requires the missing items.</summary>
    public static bool RequiresReason(string status) =>
        status is Rejected or AwaitingCompletion or Suspended;

    /// <summary>
    /// Which statuses may follow a given one.
    ///
    /// Before this existed the admin endpoint accepted any status from any
    /// status, so a brand-new request could be marked approved without ever
    /// being reviewed, and a rejected one could be silently revived. The five
    /// stages in <see cref="MembershipTracks"/> are the intended path; this is
    /// the guard rail around it.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string[]> Transitions =
        new Dictionary<string, string[]>
        {
            // المرحلة 1 → 2: a new request is picked up for review, or bounced
            // straight back if it is obviously incomplete.
            [New] = [UnderReview, AwaitingCompletion, Rejected, Cancelled],

            // المرحلة 2–4: review may ask for more, pass the request to
            // sign-off, or reject it outright.
            [UnderReview] = [AwaitingCompletion, AwaitingApproval, Rejected, Cancelled],

            // The applicant supplies what was missing and it returns to review.
            [AwaitingCompletion] = [UnderReview, Rejected, Cancelled],

            // المرحلة 5 — the only place قبول/رفض can happen.
            [AwaitingApproval] = [Approved, Rejected, AwaitingCompletion, Cancelled],

            // An active membership can be suspended, expire, or be closed out.
            [Approved] = [Suspended, Expired, Cancelled, Completed],

            // تعليق is reversible; إلغاء is not.
            [Suspended] = [Approved, Cancelled],

            // An expired membership comes back through renewal.
            [Expired] = [Approved, Cancelled],

            [Rejected] = [],
            [Cancelled] = [],
            [Completed] = [],
        };

    /// <summary>
    /// True when <paramref name="to"/> may follow <paramref name="from"/>.
    /// A no-op transition (same status, e.g. re-saving notes) is allowed.
    /// </summary>
    public static bool CanTransition(string from, string to)
    {
        if (from == to) return true;
        return Transitions.TryGetValue(from, out var allowed) && allowed.Contains(to);
    }

    /// <summary>
    /// The §6 permission a status change requires, so the endpoint can check it
    /// without restating the mapping.
    /// </summary>
    public static string RequiredAction(string to) => to switch
    {
        Approved => MembershipRoles.Actions.Approve,
        Rejected => MembershipRoles.Actions.Reject,
        AwaitingCompletion => MembershipRoles.Actions.RequestCompletion,
        // Suspending, cancelling, expiring, and closing all end an active
        // membership, so they sit behind the one §6 grant for that —
        // تعليق/إلغاء — rather than being reachable with plain review rights.
        Suspended or Cancelled or Expired or Completed => MembershipRoles.Actions.Suspend,
        _ => MembershipRoles.Actions.Review,
    };

    /// <summary>Bilingual labels for the admin dashboard.</summary>
    public static readonly Dictionary<string, (string Ar, string En)> Labels = new()
    {
        [New] = ("جديد", "New"),
        [UnderReview] = ("تحت المراجعة", "Under Review"),
        [AwaitingCompletion] = ("بانتظار استكمال البيانات", "Awaiting Completion"),
        [AwaitingApproval] = ("بانتظار الاعتماد", "Awaiting Approval"),
        [Approved] = ("معتمد", "Approved"),
        [Rejected] = ("مرفوض", "Rejected"),
        [Cancelled] = ("ملغي", "Cancelled"),
        [Completed] = ("منتهي", "Completed"),
        [Suspended] = ("معلق", "Suspended"),
        [Expired] = ("منتهية الصلاحية", "Expired"),
    };
}
