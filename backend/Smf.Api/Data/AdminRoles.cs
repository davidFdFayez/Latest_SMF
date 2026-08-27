namespace Smf.Api.Data;

/// <summary>
/// Federation team roles and the areas each one administers, per the approved
/// content requirements (§17). Stored as the string value on
/// <see cref="Models.AdminUser.Role"/>.
/// </summary>
public static class AdminRoles
{
    public const string SuperAdmin = "super_admin";
    public const string HumanResources = "hr";
    public const string EventsManager = "events";
    public const string MediaApprover = "media_approver";
    public const string MediaProducer = "media_producer";
    public const string PeopleRegistry = "people_registry";
    public const string ClubsRegistrations = "clubs_registrations";
    public const string Finance = "finance";
    public const string InformationTechnology = "it";

    /// <summary>Permission areas a role may be granted.</summary>
    public static class Areas
    {
        public const string Users = "users";
        public const string Permissions = "permissions";
        public const string Settings = "settings";
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
        public const string Support = "support";
        public const string Integrations = "integrations";
    }

    public record RoleDefinition(string Key, string NameAr, string NameEn, string DescriptionAr, string DescriptionEn, string[] Grants);

    /// <summary>Wildcard grant — the super admin administers everything.</summary>
    public const string AllAreas = "*";

    public static readonly IReadOnlyList<RoleDefinition> Definitions =
    [
        new(SuperAdmin,
            "صلاحية كاملة", "Super Admin",
            "إدارة الموقع بالكامل، المستخدمين، الصلاحيات، الإعدادات، واعتماد ونشر جميع المحتويات.",
            "Full site administration: users, permissions, settings, and approving and publishing all content.",
            [AllAreas]),

        new(HumanResources,
            "الموارد البشرية", "Human Resources",
            "إدارة الموظفين، اللوائح، السياسات، والنماذج الخاصة بالموارد البشرية.",
            "Managing employees, regulations, policies, and HR forms.",
            [Areas.Hr, Areas.Policies]),

        new(EventsManager,
            "البطولات والفعاليات", "Tournaments & Events",
            "إدارة البطولات والفعاليات، وإضافة وتحديث جميع البيانات المتعلقة بها.",
            "Managing tournaments and events, and adding and updating all related data.",
            [Areas.Events, Areas.Courses]),

        new(MediaApprover,
            "اعتماد المحتوى الإعلامي", "Media Approval",
            "مراجعة واعتماد المحتوى الإعلامي والسوشال ميديا قبل النشر.",
            "Reviewing and approving media and social content before publication.",
            [Areas.News, Areas.Media, Areas.ContentPublish]),

        new(MediaProducer,
            "التصاميم والسوشال ميديا", "Design & Social Media",
            "إدارة التصاميم وإنشاء وإدارة محتوى السوشال ميديا.",
            "Managing designs and creating and managing social media content.",
            [Areas.Media, Areas.News]),

        new(PeopleRegistry,
            "بيانات الحكام والمدربين واللاعبين", "Referees, Coaches & Athletes",
            "إدارة بيانات الحكام والمدربين واللاعبين.",
            "Managing referee, coach, and athlete records.",
            [Areas.Athletes, Areas.Coaches, Areas.Referees]),

        new(ClubsRegistrations,
            "الأندية والتسجيل", "Clubs & Registration",
            "إدارة الأندية، التسجيل، إعلانات البطولات، والدورات.",
            "Managing clubs, registration, tournament announcements, and courses.",
            [Areas.Clubs, Areas.Registrations, Areas.Events, Areas.Courses]),

        new(Finance,
            "الشؤون المالية", "Finance",
            "إدارة الشؤون المالية والتقارير والرسوم.",
            "Managing financial affairs, reports, and fees.",
            [Areas.Finance, Areas.Reports]),

        new(InformationTechnology,
            "تقنية المعلومات", "Information Technology",
            "إدارة المستخدمين والصلاحيات، إعدادات الموقع، الدعم الفني، والتكاملات التقنية.",
            "Managing users and permissions, site settings, technical support, and technical integrations.",
            [Areas.Users, Areas.Permissions, Areas.Settings, Areas.Support, Areas.Integrations]),
    ];

    public static RoleDefinition? Get(string? role) =>
        role is null ? null : Definitions.FirstOrDefault(d => d.Key == role);

    public static bool IsValid(string? role) => Get(role) is not null;

    /// <summary>True when the role administers the given area.</summary>
    public static bool Can(string? role, string area)
    {
        var definition = Get(role);
        if (definition is null) return false;
        return definition.Grants.Contains(AllAreas) || definition.Grants.Contains(area);
    }
}
