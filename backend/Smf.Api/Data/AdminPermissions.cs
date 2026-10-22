namespace Smf.Api.Data;

/// <summary>
/// Every permission a role can be granted.
///
/// Roles and their assignments live in the database so the federation can
/// create and change them from the admin console, but the permissions
/// themselves stay in code: each one is only meaningful because some endpoint
/// checks it, so a permission invented at runtime would guard nothing.
///
/// The site-area keys are the §17 areas the original <see cref="AdminRoles"/>
/// used, kept verbatim so existing grants carry over. The membership keys are
/// the eight §6 actions of <see cref="MembershipRoles.Actions"/>, prefixed so a
/// site area and a register action can never collide.
/// </summary>
public static class AdminPermissions
{
    /// <summary>Wildcard — held only by the Super Admin role, grants everything.</summary>
    public const string All = "*";

    public const string Users = "users";
    public const string Permissions = "permissions";
    public const string Settings = "settings";
    public const string Integrations = "integrations";
    public const string Support = "support";

    public const string ContentPublish = "content.publish";
    public const string News = "news";
    public const string Media = "media";
    public const string Events = "events";
    public const string Courses = "courses";

    public const string Clubs = "clubs";
    public const string Registrations = "registrations";
    public const string Athletes = "athletes";
    public const string Coaches = "coaches";
    public const string Referees = "referees";

    public const string Hr = "hr";
    public const string Policies = "policies";
    public const string Finance = "finance";
    public const string Reports = "reports";
    public const string Whistleblower = "whistleblower";

    /* ── Phase 3: running a tournament ───────────────────────────────────
       The document hands each stage to a different person — an organiser sets
       the tournament up, a technical team weighs athletes in, a technical
       delegate makes the draw — so these are separate grants rather than one
       "tournaments" key that would give the weigh-in desk the power to redraw
       a bracket. */
    public const string TournamentManage = "tournament.manage";
    public const string TournamentEntries = "tournament.entries";
    public const string TournamentTechnical = "tournament.technical";
    public const string TournamentDirector = "tournament.director";
    public const string TournamentDraw = "tournament.draw";
    public const string TournamentSchedule = "tournament.schedule";

    /* Every stage of the document is "create or edit" and then "approve", and
       it says each pair may go to one person or to two. Making a thing and
       signing it off are therefore separate grants throughout: publishing a
       tournament, approving an entry, approving a bracket, approving a
       schedule. Nothing moves to the next stage without the approval half. */
    public const string TournamentApprove = "tournament.approve";
    public const string TournamentEntriesApprove = "tournament.entries.approve";
    public const string TournamentDrawApprove = "tournament.draw.approve";
    public const string TournamentScheduleApprove = "tournament.schedule.approve";

    public const string MembershipPrefix = "membership.";

    /// <summary>The permission key for a §6 action, e.g. "approve" → "membership.approve".</summary>
    public static string ForMembershipAction(string action) => MembershipPrefix + action;

    public record Group(string Key, string NameAr, string NameEn);

    public record Definition(string Key, string GroupKey, string NameAr, string NameEn, string DescriptionEn);

    public static readonly IReadOnlyList<Group> Groups =
    [
        new("administration", "إدارة النظام", "Administration"),
        new("content", "المحتوى", "Content"),
        new("people", "الأندية والمنتسبون", "Clubs & people"),
        new("membership", "سجل العضويات (§6)", "Membership register (§6)"),
        new("operations", "الشؤون الإدارية", "Operations"),
        new("tournaments", "تشغيل البطولات", "Tournament operation"),
    ];

    public static readonly IReadOnlyList<Definition> Definitions = BuildDefinitions();

    private static List<Definition> BuildDefinitions()
    {
        List<Definition> list =
        [
            new(Users, "administration", "المستخدمون", "Users",
                "Create admin accounts, reset passwords, activate or deactivate them, and assign roles."),
            new(Permissions, "administration", "الأدوار والصلاحيات", "Roles & permissions",
                "Create, edit and delete roles and choose which permissions each one grants."),
            new(Settings, "administration", "إعدادات الموقع", "Site settings",
                "Edit site-wide website content — contact details, social links, navigation labels — and notification templates."),
            new(Support, "administration", "الدعم الفني", "Support",
                "Read and manage contact messages sent from the public website."),
            new(Integrations, "administration", "التكاملات التقنية", "Integrations",
                "Reserved for technical integrations (no admin screen yet)."),

            new(ContentPublish, "content", "اعتماد ونشر المحتوى", "Publish content",
                "Edit the website's page content (home, federation, governance, About Muaythai and service pages) and upload images and documents."),
            new(News, "content", "الأخبار", "News",
                "Create, edit and delete news articles."),
            new(Events, "content", "البطولات والفعاليات", "Tournaments & events",
                "Create, edit and delete events and medal results."),
            new(Media, "content", "الإعلام والتصاميم", "Media",
                "Reserved for the media library (no admin screen yet)."),
            new(Courses, "content", "الدورات", "Courses",
                "Reserved for the courses module (no admin screen yet)."),

            new(Clubs, "people", "الأندية", "Clubs",
                "Reserved for club administration (no admin screen yet). The membership register is governed by the §6 permissions."),
            new(Registrations, "people", "التسجيل", "Registration",
                "Reserved for registration administration (no admin screen yet). The membership register is governed by the §6 permissions."),
            new(Athletes, "people", "اللاعبون", "Athletes",
                "Reserved for athlete records (no admin screen yet)."),
            new(Coaches, "people", "المدربون", "Coaches",
                "Reserved for coach records (no admin screen yet)."),
            new(Referees, "people", "الحكام", "Referees",
                "Reserved for referee records (no admin screen yet)."),

            new(Hr, "operations", "الموارد البشرية", "Human resources",
                "Reserved for HR (no admin screen yet)."),
            new(Policies, "operations", "اللوائح والسياسات", "Policies",
                "Reserved for regulations and policies (no admin screen yet)."),
            new(Finance, "operations", "الشؤون المالية", "Finance",
                "Reserved for finance (no admin screen yet)."),
            new(Reports, "operations", "التقارير", "Reports",
                "Reserved for reports (no admin screen yet)."),
            new(Whistleblower, "operations", "بلاغات النزاهة", "Whistleblower reports",
                "Read and manage confidential whistleblower reports."),

            new(TournamentManage, "tournaments", "إنشاء وتعديل البطولات", "Create & edit tournaments",
                "Create a tournament and set its categories, genders and weight classes (REQ-01)."),
            new(TournamentApprove, "tournaments", "اعتماد البطولة", "Approve tournament",
                "Publish a tournament, which is what opens it for entries. Separate from creating it (REQ-01)."),
            new(TournamentEntries, "tournaments", "تسجيل اللاعبين في البطولات", "Enter athletes",
                "Enter an athlete into a tournament on their behalf, and amend an entry's category, track or weight class (REQ-03)."),
            new(TournamentEntriesApprove, "tournaments", "اعتماد تسجيل اللاعبين", "Approve athlete entries",
                "Sign off an entry. An entry stands without it (REQ-04 rule 4); this is the grant for reviewing one (REQ-03)."),
            new(TournamentTechnical, "tournaments", "الحضور والفحص والوزن", "Check-in, examination & weigh-in",
                "Record check-in, the medical result and the weigh-in, and upload documents missing at the desk (REQ-08, REQ-09)."),
            new(TournamentDirector, "tournaments", "اعتماد جاهزية اللاعبين", "Approve readiness",
                "The technical director's approval, which is what puts an athlete into the pool a draw is made from (REQ-09)."),
            new(TournamentDraw, "tournaments", "إنشاء وتعديل القرعة", "Create & edit the draw",
                "The technical delegate's grant: make the draw and amend it afterwards with a reason (REQ-10)."),
            new(TournamentDrawApprove, "tournaments", "اعتماد القرعة", "Approve the draw",
                "Publish a draw, which is what releases its bouts to the schedule (REQ-10)."),
            new(TournamentSchedule, "tournaments", "جدولة النزالات والحلبات", "Create & edit the bout schedule",
                "Add rings, distribute bouts across days and rings, and generate the running order (REQ-11)."),
            new(TournamentScheduleApprove, "tournaments", "اعتماد جدول النزالات", "Approve the bout schedule",
                "Sign off the running order. Nothing proceeds to the next stage until it is approved (REQ-11)."),
        ];

        var membershipDescriptions = new Dictionary<string, string>
        {
            [MembershipRoles.Actions.View] = "Open membership requests, their documents and audit trail.",
            [MembershipRoles.Actions.Review] = "Move a request into and through review.",
            [MembershipRoles.Actions.RequestCompletion] = "Return a request to the applicant for missing items.",
            [MembershipRoles.Actions.Approve] = "Accept a request and issue or renew the membership.",
            [MembershipRoles.Actions.Reject] = "Reject a request (a reason is required).",
            [MembershipRoles.Actions.Edit] = "Amend stored request details, including after approval.",
            [MembershipRoles.Actions.Suspend] = "Suspend, cancel or delete a membership.",
            [MembershipRoles.Actions.Export] = "Download the register as CSV.",
        };

        foreach (var action in MembershipRoles.Actions.All)
        {
            var (ar, en) = MembershipRoles.Actions.Labels[action];
            list.Add(new(ForMembershipAction(action), "membership", ar, en, membershipDescriptions[action]));
        }

        return list;
    }

    private static readonly HashSet<string> Known = Definitions.Select(d => d.Key).ToHashSet();

    public static bool IsKnown(string permission) => permission == All || Known.Contains(permission);

    /// <summary>True when a permission set grants <paramref name="permission"/>.</summary>
    public static bool Grants(IReadOnlySet<string> held, string permission) =>
        held.Contains(All) || held.Contains(permission);

    /// <summary>
    /// True when <paramref name="held"/> covers every permission in
    /// <paramref name="required"/>. This is the anti-escalation rule: nobody can
    /// hand out, or take control of, more than they already hold.
    /// </summary>
    public static bool Covers(IReadOnlySet<string> held, IEnumerable<string> required) =>
        held.Contains(All) || required.All(held.Contains);
}
