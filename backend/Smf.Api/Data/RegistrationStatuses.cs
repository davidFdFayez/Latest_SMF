namespace Smf.Api.Data;

/// <summary>
/// The registration request lifecycle defined in the federation's approved
/// content requirements (§12). Stored as the string value on
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

    /// <summary>معتمد — approved.</summary>
    public const string Approved = "approved";

    /// <summary>مرفوض — rejected; a reason must be shown.</summary>
    public const string Rejected = "rejected";

    /// <summary>ملغي — cancelled by the applicant or the administration.</summary>
    public const string Cancelled = "cancelled";

    /// <summary>منتهي — fulfilled and closed.</summary>
    public const string Completed = "completed";

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
    ];

    /// <summary>Statuses that still count as open work for the dashboard counter.</summary>
    public static readonly string[] Open =
    [
        New,
        UnderReview,
        AwaitingCompletion,
        AwaitingApproval,
    ];

    public static bool IsValid(string? status) =>
        !string.IsNullOrWhiteSpace(status) && All.Contains(status);

    /// <summary>Rejection requires a reason; completion-request requires the missing items.</summary>
    public static bool RequiresReason(string status) =>
        status is Rejected or AwaitingCompletion;

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
    };
}
