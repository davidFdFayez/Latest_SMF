namespace Smf.Api.Data;

/// <summary>
/// الأدوار والصلاحيات وقواعد الاعتماد — the membership approval matrix from §6
/// of the Phase 2 workflow document.
///
/// This is deliberately separate from <see cref="AdminRoles"/>. That type says
/// which <em>areas of the site</em> a federation employee administers (news,
/// events, HR…). This one says what a person may do to a <em>membership
/// request</em>, which §6 grants along a different axis entirely — most notably,
/// reviewing and approving are held by different people: مراجع العضويات and
/// مسؤول فني may review and ask for missing items but may not accept or reject.
/// Only الاعتماد النهائي and الإدارة التنفيذية hold قبول/رفض.
///
/// §6 also says the titles may be renamed or extended, so roles are looked up
/// by key and unknown keys simply grant nothing.
/// </summary>
public static class MembershipRoles
{
    /// <summary>The eight columns of the §6 table.</summary>
    public static class Actions
    {
        /// <summary>عرض — read a request and its attachments.</summary>
        public const string View = "view";

        /// <summary>مراجعة — move a request into/through review.</summary>
        public const string Review = "review";

        /// <summary>طلب استكمال — return it to the applicant for missing items.</summary>
        public const string RequestCompletion = "request_completion";

        /// <summary>قبول — final acceptance; issues the membership.</summary>
        public const string Approve = "approve";

        /// <summary>رفض — rejection; requires a reason.</summary>
        public const string Reject = "reject";

        /// <summary>تعديل — amend stored details, including after approval.</summary>
        public const string Edit = "edit";

        /// <summary>تعليق/إلغاء — suspend or cancel an existing membership.</summary>
        public const string Suspend = "suspend";

        /// <summary>تصدير — export the register.</summary>
        public const string Export = "export";

        public static readonly string[] All =
        [
            View, Review, RequestCompletion, Approve, Reject, Edit, Suspend, Export,
        ];

        public static readonly Dictionary<string, (string Ar, string En)> Labels = new()
        {
            [View] = ("عرض", "View"),
            [Review] = ("مراجعة", "Review"),
            [RequestCompletion] = ("طلب استكمال", "Request completion"),
            [Approve] = ("قبول", "Approve"),
            [Reject] = ("رفض", "Reject"),
            [Edit] = ("تعديل", "Edit"),
            [Suspend] = ("تعليق/إلغاء", "Suspend / cancel"),
            [Export] = ("تصدير", "Export"),
        };
    }

    public const string MembershipReviewer = "membership_reviewer";
    public const string TechnicalOfficer = "technical_officer";
    public const string SystemAdmin = "system_admin";
    public const string FinalApprover = "final_approver";
    public const string Executive = "executive";

    public record RoleDefinition(
        string Key,
        string NameAr,
        string NameEn,
        string[] Grants);

    /// <summary>
    /// The §6 table, row for row. A tick in the document becomes an entry in
    /// <c>Grants</c>; an empty box is simply absent.
    /// </summary>
    public static readonly IReadOnlyList<RoleDefinition> Definitions =
    [
        // مراجع العضويات | ☑ عرض | ☑ مراجعة | ☑ طلب استكمال | ☐ قبول | ☐ رفض | ☑ تعديل | ☐ تعليق | ☑ تصدير
        new(MembershipReviewer, "مراجع العضويات", "Membership reviewer",
            [Actions.View, Actions.Review, Actions.RequestCompletion, Actions.Edit, Actions.Export]),

        // مسؤول فني | ☑ | ☑ | ☑ | ☐ | ☐ | ☐ | ☐ | ☑
        new(TechnicalOfficer, "مسؤول فني", "Technical officer",
            [Actions.View, Actions.Review, Actions.RequestCompletion, Actions.Export]),

        // مدير النظام | ☑ | ☑ | ☑ | ☐ | ☐ | ☑ | ☑ | ☑
        // Note: the system administrator may suspend, but may not accept or reject.
        new(SystemAdmin, "مدير النظام", "System administrator",
            [Actions.View, Actions.Review, Actions.RequestCompletion, Actions.Edit, Actions.Suspend, Actions.Export]),

        // الاعتماد النهائي | ☑ across all eight columns
        new(FinalApprover, "الاعتماد النهائي", "Final approver", Actions.All),

        // أخرى: الإدارة التنفيذية عند الحاجة | ☑ across all eight columns
        new(Executive, "الإدارة التنفيذية", "Executive management", Actions.All),
    ];

    public static RoleDefinition? Get(string? role) =>
        role is null ? null : Definitions.FirstOrDefault(d => d.Key == role);

    public static bool IsValid(string? role) => Get(role) is not null;

    /// <summary>
    /// Whether <paramref name="membershipRole"/> may perform <paramref name="action"/>.
    ///
    /// <paramref name="adminRole"/> is consulted only to honour the existing
    /// super admin, who administers everything by definition
    /// (<see cref="AdminRoles.SuperAdmin"/>). Every other site role grants
    /// nothing here — §6 permissions are held solely through a membership role,
    /// so an events or HR account cannot touch the register by side effect.
    /// </summary>
    public static bool Can(string? membershipRole, string? adminRole, string action)
    {
        if (adminRole == AdminRoles.SuperAdmin) return true;
        return Get(membershipRole)?.Grants.Contains(action) ?? false;
    }

    /// <summary>The effective grants for a user, for the admin UI to render against.</summary>
    public static string[] GrantsFor(string? membershipRole, string? adminRole) =>
        adminRole == AdminRoles.SuperAdmin
            ? Actions.All
            : Get(membershipRole)?.Grants ?? [];
}
