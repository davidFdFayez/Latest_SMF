namespace Smf.Api.Data;

/// <summary>
/// The federation team roles from the approved content requirements (§17).
///
/// Roles now live in the database (<see cref="Models.AdminRole"/>) so they can
/// be created and edited from the admin console. These definitions are what a
/// database starts with: they are seeded once, after which the stored roles
/// are authoritative and may be renamed, re-permissioned, or deleted — except
/// <see cref="SuperAdmin"/>, which is locked so the console can never lose the
/// one role that can repair everything else.
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

    public record RoleDefinition(string Key, string NameAr, string NameEn, string DescriptionAr, string DescriptionEn, string[] Grants);

    public static readonly IReadOnlyList<RoleDefinition> Definitions =
    [
        new(SuperAdmin,
            "صلاحية كاملة", "Super Admin",
            "إدارة الموقع بالكامل، المستخدمين، الصلاحيات، الإعدادات، واعتماد ونشر جميع المحتويات.",
            "Full site administration: users, permissions, settings, and approving and publishing all content.",
            [AdminPermissions.All]),

        new(HumanResources,
            "الموارد البشرية", "Human Resources",
            "إدارة الموظفين، اللوائح، السياسات، والنماذج الخاصة بالموارد البشرية.",
            "Managing employees, regulations, policies, and HR forms.",
            [AdminPermissions.Hr, AdminPermissions.Policies]),

        new(EventsManager,
            "البطولات والفعاليات", "Tournaments & Events",
            "إدارة البطولات والفعاليات، وإضافة وتحديث جميع البيانات المتعلقة بها.",
            "Managing tournaments and events, and adding and updating all related data.",
            [AdminPermissions.Events, AdminPermissions.Courses]),

        new(MediaApprover,
            "اعتماد المحتوى الإعلامي", "Media Approval",
            "مراجعة واعتماد المحتوى الإعلامي والسوشال ميديا قبل النشر.",
            "Reviewing and approving media and social content before publication.",
            [AdminPermissions.News, AdminPermissions.Media, AdminPermissions.ContentPublish]),

        new(MediaProducer,
            "التصاميم والسوشال ميديا", "Design & Social Media",
            "إدارة التصاميم وإنشاء وإدارة محتوى السوشال ميديا.",
            "Managing designs and creating and managing social media content.",
            [AdminPermissions.Media, AdminPermissions.News]),

        new(PeopleRegistry,
            "بيانات الحكام والمدربين واللاعبين", "Referees, Coaches & Athletes",
            "إدارة بيانات الحكام والمدربين واللاعبين.",
            "Managing referee, coach, and athlete records.",
            [AdminPermissions.Athletes, AdminPermissions.Coaches, AdminPermissions.Referees]),

        new(ClubsRegistrations,
            "الأندية والتسجيل", "Clubs & Registration",
            "إدارة الأندية، التسجيل، إعلانات البطولات، والدورات.",
            "Managing clubs, registration, tournament announcements, and courses.",
            [AdminPermissions.Clubs, AdminPermissions.Registrations, AdminPermissions.Events, AdminPermissions.Courses]),

        new(Finance,
            "الشؤون المالية", "Finance",
            "إدارة الشؤون المالية والتقارير والرسوم.",
            "Managing financial affairs, reports, and fees.",
            [AdminPermissions.Finance, AdminPermissions.Reports]),

        new(InformationTechnology,
            "تقنية المعلومات", "Information Technology",
            "إدارة المستخدمين والصلاحيات، إعدادات الموقع، الدعم الفني، والتكاملات التقنية.",
            "Managing users and permissions, site settings, technical support, and technical integrations.",
            [AdminPermissions.Users, AdminPermissions.Permissions, AdminPermissions.Settings, AdminPermissions.Support, AdminPermissions.Integrations]),
    ];

    public static RoleDefinition? Get(string? role) =>
        role is null ? null : Definitions.FirstOrDefault(d => d.Key == role);
}
