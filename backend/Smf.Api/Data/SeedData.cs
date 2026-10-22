using System.Text.Json;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Data;

public static class SeedData
{
    public static void Initialize(SmfDbContext db, IWebHostEnvironment env, ILogger? logger = null, IConfiguration? config = null)
    {
        db.Database.EnsureCreated();

        // EnsureCreated only ever builds the schema once, so databases created
        // before a model gained a column keep failing on insert. Add anything
        // missing before the app starts serving.
        SqliteSchemaGuard.EnsureColumns(db, logger);

        // Roles before users, so every seeded account can be given its roles.
        SeedRoles(db, logger);

        if (!db.AdminUsers.Any())
        {
            SeedAdminUser(db, env, config, logger);
        }

        // One account per §6 membership role, so role-based access can actually
        // be exercised. Phase 1 compliance cases P1–P3 need an account per role
        // to test against, and the federation's testing note asks for exactly
        // that. Development only — these are well-known credentials and must
        // never exist on a deployed environment.
        if (env.IsDevelopment())
        {
            SeedMembershipRoleAccounts(db, config);
        }

        EnsureSuperAdmin(db, env, logger);

        // Memberships approved before the term/stage columns existed carry no
        // expiry and a default stage, so they would never lapse and the console
        // would show them stuck at stage 1. Backfill once, idempotently.
        BackfillMembershipTerms(db, config, logger);

        if (!db.Results.Any())
        {
            SeedResults(db, env);
        }

        // Results seeded before the Arabic name columns existed hold empty
        // strings, and SeedResults only runs on an empty table, so they would
        // stay English-only forever. Fill them from the same source file.
        BackfillResultNames(db, env, logger);

        if (!db.NewsArticles.Any())
        {
            SeedNews(db, env);
        }
        else if (db.NewsArticles.Count() < 20 || !db.NewsArticles.Any(n => n.Source == "IFMA") || !db.NewsArticles.Any(n => n.TitleAr.Contains("تايلاند")))
        {
            db.NewsArticles.RemoveRange(db.NewsArticles);
            db.SaveChanges();
            SeedNews(db, env);
        }
        else
        {
            CorrectSwappedNewsThumbnails(db, logger);
        }

        if (!db.Events.Any())
        {
            SeedEvents(db, env);
        }
        else if (db.Events.Count() < 30)
        {
            db.Events.RemoveRange(db.Events);
            db.SaveChanges();
            SeedEvents(db, env);
        }
        else
        {
            CorrectRenamedEventTitles(db, logger);
        }

        // Guarded on "no club registrations at all", not "none approved", so a
        // real application that is still pending review can never be joined by
        // fabricated clubs in the same list.
        if (AllowDemoClubs(env, config) && !db.Registrations.Any(r => r.Type == "club"))
        {
            SeedClubs(db);
            logger?.LogInformation("Seeded demo clubs for the public directory.");
        }

        if (!db.SiteSettings.Any())
        {
            SeedSettings(db);
        }
        else
        {
            // Keep address/hours/socials aligned with contents.pdf
            UpsertSetting(db, "address", "الرياض، حي الرفيعة، شارع الديوان، مجمع الأمير فيصل بن فهد الأولمبي", "Riyadh, Al Rafiah District, Al Diwan St., Prince Faisal bin Fahd Olympic Complex");
            UpsertSetting(db, "working_hours", "من الساعة 10 ص وحتى الساعة 6 م", "10:00 AM – 6:00 PM");
            UpsertSetting(db, "instagram", "https://www.instagram.com/smf__ksa/", "https://www.instagram.com/smf__ksa/");
            UpsertSetting(db, "twitter", "https://x.com/SMF_KSA", "https://x.com/SMF_KSA");
        }

        db.SaveChanges();
    }

    private static void UpsertSetting(SmfDbContext db, string key, string ar, string en)
    {
        var s = db.SiteSettings.FirstOrDefault(x => x.Key == key);
        if (s is null)
        {
            db.SiteSettings.Add(new SiteSetting { Key = key, ValueAr = ar, ValueEn = en });
        }
        else
        {
            s.ValueAr = ar;
            s.ValueEn = en;
        }
    }

    /// <summary>
    /// Gives already-approved memberships the three-year term and final stage
    /// the Phase 2 model expects (§1).
    ///
    /// <see cref="SqliteSchemaGuard"/> adds a missing column but cannot know what
    /// the rows should contain, so an approval recorded before the column
    /// existed has a null <c>ExpiresAt</c> — meaning it never appears in the
    /// expiry sweep and never lapses. The term is dated from whatever approval
    /// evidence the row actually has, falling back to its creation date.
    ///
    /// Idempotent: only rows still missing the value are touched, so this does
    /// nothing on an up-to-date database.
    /// </summary>
    private static void BackfillMembershipTerms(SmfDbContext db, IConfiguration? config, ILogger? logger)
    {
        var pending = db.Registrations
            .Where(r => r.Status == RegistrationStatuses.Approved && r.ExpiresAt == null)
            .ToList();

        foreach (var registration in pending)
        {
            var approvedAt = registration.ApprovedAt
                             ?? registration.StatusChangedAt
                             ?? registration.CreatedAt;

            registration.ApprovedAt ??= approvedAt;
            registration.ExpiresAt = approvedAt.AddYears(MembershipTerms.YearsFor(registration.Type, config));
        }

        // The stage is derived from the status, so any row still sitting at the
        // default while its status says otherwise is corrected too.
        var stages = db.Registrations
            .Where(r => r.StageOrder <= 1 && r.Status != RegistrationStatuses.New)
            .ToList();

        foreach (var registration in stages)
        {
            var track = MembershipTracks.Get(registration.Type);
            if (track is null) continue;

            var stage = track.Stages.FirstOrDefault(x => x.Status == registration.Status);
            registration.StageOrder = stage?.Order ?? track.Stages.Count;
        }

        if (pending.Count == 0 && stages.Count == 0) return;

        db.SaveChanges();
        logger?.LogInformation(
            "Backfilled membership terms for {Terms} approved registration(s) and stages for {Stages}.",
            pending.Count, stages.Count);
    }

    /// <summary>
    /// Creates the default roles the first time the role tables are empty, and
    /// carries every existing account's legacy <c>Role</c>/<c>MembershipRole</c>
    /// over as role assignments in the same pass.
    ///
    /// Keyed on "no roles at all" so it runs exactly once. Once roles exist they
    /// belong to the federation: a role someone deleted is not recreated, and a
    /// user whose roles were removed does not get the legacy ones back.
    /// </summary>
    private static void SeedRoles(SmfDbContext db, ILogger? logger)
    {
        if (db.Roles.Any()) return;

        var created = new Dictionary<string, AdminRole>();

        foreach (var definition in AdminRoles.Definitions)
        {
            created[definition.Key] = AddRole(db, definition.Key, definition.NameAr, definition.NameEn,
                definition.DescriptionAr, definition.DescriptionEn, definition.Grants,
                isSystem: definition.Key == AdminRoles.SuperAdmin);
        }

        foreach (var definition in MembershipRoles.Definitions)
        {
            created[definition.Key] = AddRole(db, definition.Key, definition.NameAr, definition.NameEn,
                $"دور سجل العضويات وفق §6: {definition.NameAr}.",
                $"Membership register role from §6: {definition.NameEn}.",
                definition.Grants.Select(AdminPermissions.ForMembershipAction).ToArray(),
                isSystem: false);
        }

        db.SaveChanges();

        var migrated = 0;
        foreach (var user in db.AdminUsers.ToList())
        {
            foreach (var key in new[] { user.Role, user.MembershipRole }.Distinct())
            {
                if (string.IsNullOrWhiteSpace(key) || !created.TryGetValue(key, out var role)) continue;

                db.UserRoles.Add(new AdminUserRole { AdminUserId = user.Id, AdminRoleId = role.Id });
                migrated++;
            }
        }

        db.SaveChanges();
        logger?.LogInformation(
            "Seeded {Roles} admin roles and carried over {Assignments} existing role assignment(s).",
            created.Count, migrated);
    }

    private static AdminRole AddRole(SmfDbContext db, string key, string nameAr, string nameEn,
                                     string descriptionAr, string descriptionEn, string[] permissions, bool isSystem)
    {
        var role = new AdminRole
        {
            Key = key,
            NameAr = nameAr,
            NameEn = nameEn,
            DescriptionAr = descriptionAr,
            DescriptionEn = descriptionEn,
            IsSystem = isSystem,
            CreatedAt = DateTime.UtcNow,
            Permissions = permissions.Select(p => new AdminRolePermission { Permission = p }).ToList(),
        };

        db.Roles.Add(role);
        return role;
    }

    /// <summary>
    /// Guards against a console nobody can administer: if no active account
    /// holds the Super Admin role, users and roles can never be managed again.
    ///
    /// In development the well-known <c>admin</c> account is reactivated and
    /// given the role — the schema guard once deactivated it and blanked its
    /// role on existing databases. Anywhere else the state is only reported:
    /// an account may have been switched off on purpose, and silently turning a
    /// known username back on in production would be worse than the lockout.
    /// </summary>
    private static void EnsureSuperAdmin(SmfDbContext db, IWebHostEnvironment env, ILogger? logger)
    {
        var hasActiveSuperAdmin = db.UserRoles.Any(ur =>
            ur.User!.IsActive && ur.Role!.Permissions.Any(p => p.Permission == AdminPermissions.All));
        if (hasActiveSuperAdmin) return;

        var role = db.Roles.FirstOrDefault(r => r.Key == AdminRoles.SuperAdmin);
        var admin = db.AdminUsers.FirstOrDefault(u => u.Username == "admin");

        if (!env.IsDevelopment() || role is null || admin is null)
        {
            logger?.LogCritical(
                "No active admin account holds the Super Admin role, so users and roles cannot be managed from the console.");
            return;
        }

        admin.IsActive = true;
        if (!db.UserRoles.Any(ur => ur.AdminUserId == admin.Id && ur.AdminRoleId == role.Id))
            db.UserRoles.Add(new AdminUserRole { AdminUserId = admin.Id, AdminRoleId = role.Id });

        db.SaveChanges();
        logger?.LogWarning(
            "No active Super Admin existed; reactivated the development 'admin' account and gave it the Super Admin role.");
    }

    /// <summary>
    /// The first administrator, on an empty database.
    ///
    /// Outside development this needs <c>Seed:AdminPassword</c> to be set.
    /// It used to create <c>admin</c> with a password written in this file,
    /// in every environment — and this repository is public, so that was a
    /// published credential for any deployment that had ever started with an
    /// empty database. Now a deployment either says what the password is, or
    /// starts with no administrator and says so loudly.
    /// </summary>
    private static void SeedAdminUser(
        SmfDbContext db,
        IWebHostEnvironment env,
        IConfiguration? config,
        ILogger? logger)
    {
        var password = config?["Seed:AdminPassword"];

        if (string.IsNullOrWhiteSpace(password))
        {
            if (!env.IsDevelopment())
            {
                logger?.LogCritical(
                    "No administrator exists and Seed:AdminPassword is not set, so none was created. "
                    + "Set it and restart, or the console cannot be signed into.");
                return;
            }

            password = "Admin@123";
        }

        var superAdmin = db.Roles.FirstOrDefault(r => r.Key == AdminRoles.SuperAdmin);

        var (hash, salt) = PasswordHasher.HashPassword(password);
        db.AdminUsers.Add(new AdminUser
        {
            Username = "admin",
            PasswordHash = hash,
            PasswordSalt = salt,
            DisplayName = "مدير النظام / System Administrator",
            CreatedAt = DateTime.UtcNow,
            Roles = superAdmin is null ? [] : [new AdminUserRole { AdminRoleId = superAdmin.Id }],
        });

        db.SaveChanges();
    }

    /// <summary>
    /// A test account for each membership role in §6. Each carries only that
    /// role's grants, so the separation the document describes — reviewers who
    /// cannot approve, a system administrator who cannot accept or reject — is
    /// verifiable rather than theoretical.
    /// </summary>
    private static void SeedMembershipRoleAccounts(SmfDbContext db, IConfiguration? config)
    {
        // Overridable so a shared test environment need not use the default.
        var password = config?["Seed:RoleAccountPassword"] ?? "Test@12345";
        var roles = db.Roles.ToDictionary(r => r.Key);

        foreach (var role in MembershipRoles.Definitions)
        {
            var username = role.Key;
            if (db.AdminUsers.Any(u => u.Username == username)) continue;

            // Paired with a site role that grants nothing on the register: §6
            // permissions must come from the membership role alone, so these
            // accounts prove the register cannot be reached through any other
            // grant. Either role may since have been deleted from the console.
            var assigned = new[] { AdminRoles.PeopleRegistry, role.Key }
                .Where(roles.ContainsKey)
                .Select(key => new AdminUserRole { AdminRoleId = roles[key].Id })
                .ToList();

            var (hash, salt) = PasswordHasher.HashPassword(password);
            db.AdminUsers.Add(new AdminUser
            {
                Username = username,
                PasswordHash = hash,
                PasswordSalt = salt,
                DisplayName = $"{role.NameAr} / {role.NameEn}",
                Roles = assigned,
                CreatedAt = DateTime.UtcNow,
            });
        }

        db.SaveChanges();
    }

    private static void SeedResults(SmfDbContext db, IWebHostEnvironment env)
    {
        var json = ReadResultsJson(env);
        var records = JsonSerializer.Deserialize<List<RawResultRecord>>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? new List<RawResultRecord>();

        foreach (var r in records)
        {
            db.Results.Add(new ResultRecord
            {
                Year = r.Year,
                Athlete = r.Athlete,
                AthleteSlug = r.AthleteSlug,
                Event = (r.Event ?? string.Empty).Replace("&amp;", "&"),
                Location = r.Location ?? string.Empty,
                Category = r.Category ?? string.Empty,
                Medal = (r.Medal ?? string.Empty).ToLowerInvariant(),
                AthleteAr = r.AthleteAr ?? string.Empty,
                EventAr = r.EventAr ?? string.Empty
            });
        }
    }

    /// <summary>
    /// Copies the Arabic athlete and championship names onto results that were
    /// seeded before those columns existed.
    ///
    /// Matched on year plus the English athlete name, which is exactly how the
    /// rows were written in the first place, so the pairing is unambiguous.
    /// Rows whose source entry has no Arabic name — an athlete absent from the
    /// federation's participations record, or one whose spelling is unconfirmed
    /// — are left empty on purpose and the archive shows the English name.
    ///
    /// Idempotent: only rows still missing a value are considered.
    /// </summary>
    private static void BackfillResultNames(SmfDbContext db, IWebHostEnvironment env, ILogger? logger)
    {
        var pending = db.Results.Where(r => r.AthleteAr == "" || r.EventAr == "").ToList();
        if (pending.Count == 0) return;

        List<RawResultRecord> source;
        try
        {
            source = JsonSerializer.Deserialize<List<RawResultRecord>>(
                ReadResultsJson(env),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Could not read results.json to backfill Arabic names.");
            return;
        }

        var byKey = source
            .Where(r => !string.IsNullOrWhiteSpace(r.AthleteAr) || !string.IsNullOrWhiteSpace(r.EventAr))
            .GroupBy(r => (r.Year, r.Athlete))
            .ToDictionary(g => g.Key, g => g.First());

        var filled = 0;
        foreach (var record in pending)
        {
            if (!byKey.TryGetValue((record.Year, record.Athlete), out var match)) continue;

            if (record.AthleteAr == "" && match.AthleteAr is { Length: > 0 })
            {
                record.AthleteAr = match.AthleteAr;
                filled++;
            }

            if (record.EventAr == "" && match.EventAr is { Length: > 0 }) record.EventAr = match.EventAr;
        }

        if (filled == 0) return;

        db.SaveChanges();
        logger?.LogInformation("Backfilled Arabic names on {Count} result record(s).", filled);
    }

    private static string ReadResultsJson(IWebHostEnvironment env)
    {
        var candidatePaths = new[]
        {
            Path.Combine(env.ContentRootPath, "results.json"),
            Path.Combine(AppContext.BaseDirectory, "results.json")
        };

        foreach (var path in candidatePaths)
        {
            if (File.Exists(path))
            {
                return File.ReadAllText(path);
            }
        }

        throw new FileNotFoundException(
            "results.json not found. Place it next to the API project (ContentRoot) or in the build output.");
    }

    private record RawResultRecord
    {
        public int Year { get; init; }
        public string Athlete { get; init; } = string.Empty;
        public string AthleteSlug { get; init; } = string.Empty;
        public string? Event { get; init; }
        public string? Location { get; init; }
        public string? Category { get; init; }
        public string? Medal { get; init; }
        public string? AthleteAr { get; init; }
        public string? EventAr { get; init; }
    }

    private static void SeedSettings(SmfDbContext db)
    {
        var settings = new[]
        {
            new SiteSetting { Key = "federation_name", ValueAr = "الاتحاد السعودي للملاكمة التايلندية", ValueEn = "Saudi Muaythai Federation" },
            new SiteSetting { Key = "federation_short_name", ValueAr = "الاتحاد السعودي للملاكمة التايلندية", ValueEn = "SMF" },
            new SiteSetting { Key = "email", ValueAr = "info@saudimuaythai.sa", ValueEn = "info@saudimuaythai.sa" },
            new SiteSetting { Key = "phone", ValueAr = "+966552677377", ValueEn = "+966552677377" },
            new SiteSetting { Key = "address", ValueAr = "الرياض، حي الرفيعة، شارع الديوان، مجمع الأمير فيصل بن فهد الأولمبي", ValueEn = "Riyadh, Al Rafiah District, Al Diwan St., Prince Faisal bin Fahd Olympic Complex" },
            new SiteSetting { Key = "twitter", ValueAr = "https://x.com/SMF_KSA", ValueEn = "https://x.com/SMF_KSA" },
            new SiteSetting { Key = "instagram", ValueAr = "https://www.instagram.com/smf__ksa/", ValueEn = "https://www.instagram.com/smf__ksa/" },
            new SiteSetting { Key = "working_hours", ValueAr = "من الساعة 10 ص وحتى الساعة 6 م", ValueEn = "10:00 AM – 6:00 PM" }
        };

        db.SiteSettings.AddRange(settings);
    }

    /* TXT-37/38/39 — the three city championships are "داخلية" (internal), not
       "الإقليمية" (regional). events-2026.json is corrected, but events only
       reseed on an empty (or short) table, so rename them in place as well.
       Idempotent: the second run finds nothing to change. */
    private static readonly (string Old, string New)[] RenamedEventTitles =
    [
        ("بطولة جدة الإقليمية", "بطولة جدة داخلية"),
        ("بطولة جيزان الإقليمية", "بطولة جيزان داخلية"),
        ("بطولة الخبر الإقليمية", "بطولة خبر داخلية"),
    ];

    private static void CorrectRenamedEventTitles(SmfDbContext db, ILogger? logger)
    {
        var changed = 0;

        foreach (var (oldTitle, newTitle) in RenamedEventTitles)
        {
            foreach (var item in db.Events.Where(e => e.TitleAr == oldTitle))
            {
                item.TitleAr = newTitle;
                changed++;
            }
        }

        if (changed == 0) return;

        db.SaveChanges();
        logger?.LogInformation("Renamed {Count} event title(s) from الإقليمية to داخلية.", changed);
    }

    /* CNT-02 — the Thailand (29 Jul 2026) and Jazan (26 Jul 2026) stories shipped
       with each other's thumbnail. The seed below is corrected, but seeding only
       runs on an empty table, so a database created before the fix keeps the
       swap. This puts each image back on its own story and is a no-op once
       they already match. */
    private const string ThailandThumbnail = "/assets/uploads/news/20260730-163342-72a4cba9.png";
    private const string JazanThumbnail = "/assets/uploads/news/20260730-163634-1b23498c.png";

    private static void CorrectSwappedNewsThumbnails(SmfDbContext db, ILogger? logger)
    {
        var thailand = db.NewsArticles.FirstOrDefault(n => n.TitleAr.Contains("تايلاند"));
        var jazan = db.NewsArticles.FirstOrDefault(n => n.TitleAr.Contains("بطولة جازان"));
        if (thailand is null || jazan is null) return;

        if (thailand.ImageUrl != JazanThumbnail || jazan.ImageUrl != ThailandThumbnail) return;

        thailand.ImageUrl = ThailandThumbnail;
        jazan.ImageUrl = JazanThumbnail;
        db.SaveChanges();

        logger?.LogInformation("Corrected the swapped Thailand/Jazan news thumbnails.");
    }

    private static void SeedNews(SmfDbContext db, IWebHostEnvironment env)
    {
        db.NewsArticles.AddRange(
            new NewsArticle
            {
                TitleAr = "أبطال المواي تاي السعودي يتألقون في تايلاند بأربعة انتصارات",
                TitleEn = "Saudi Muaythai athletes shine in Thailand with four victories",
                SummaryAr = "حقق أربعة لاعبين سعوديين نتائج مميزة في نزالات بمملكة تايلاند، بثلاثة انتصارات بالضربة القاضية وانتصار بالنقاط.",
                SummaryEn = "Four Saudi athletes delivered strong results in Thailand, with three knockout wins and one decision victory.",
                BodyAr = "حقق أربعة لاعبين سعوديين نتائج مميزة في نزالات أقيمت بمملكة تايلاند، محققين أربعة انتصارات — ثلاثة منها بالضربة القاضية وانتصار بالنقاط — مع تألق لاعبي المنتخب عبدالعزيز المبرد وطامي العامري ضمن تدريباتهما في نادي Jitmuangnon Gym العريق.",
                BodyEn = "Four Saudi fighters posted standout results in Thailand — three knockouts and one points win — highlighted by national-team athletes training at Jitmuangnon Gym.",
                Category = "news",
                ImageUrl = "/assets/uploads/news/20260730-163342-72a4cba9.png",
                PublishedAt = new DateTime(2026, 7, 29),
                IsPublished = true,
                Source = "SMF"
            },
            new NewsArticle
            {
                TitleAr = "بطولة جازان للمواي تاي: أبطالنا يواصلون التألق داخل الحلبة",
                TitleEn = "Jazan Muaythai Championship: Saudi fighters bring the intensity",
                SummaryAr = "يتواصل الحماس في بطولة جازان للمواي تاي بمستويات مميزة تعكس الشغف وروح المنافسة.",
                SummaryEn = "The Jazan Muaythai Championship continues with strong performances reflecting passion and competitive spirit.",
                BodyAr = "يتواصل الحماس في بطولة جازان للمواي تاي، حيث يقدّم أبطالنا مستويات مميزة تعكس الشغف والإصرار وروح المنافسة — من لحظات الاستعداد الأخيرة حتى النزالات القوية داخل الحلبة.",
                BodyEn = "Excitement continues at the Jazan Muaythai Championship as Saudi athletes deliver strong performances from final preparations through intense in-ring action.",
                Category = "events",
                ImageUrl = "/assets/uploads/news/20260730-163634-1b23498c.png",
                PublishedAt = new DateTime(2026, 7, 26),
                IsPublished = true,
                Source = "SMF"
            },
            new NewsArticle
            {
                TitleAr = "بطولة جيزان للمراكز",
                TitleEn = "Jizan Regional Championship for Centers",
                SummaryAr = "منافسات قوية بين المراكز في بطولة جيزان داخلية للمواي تاي.",
                SummaryEn = "Strong competition among centers at the Jizan regional Muaythai championship.",
                BodyAr = "شهدت بطولة جيزان للمراكز حضوراً تنافسياً مميزاً بين المراكز المشاركة، في إطار دعم الاتحاد لنشر الرياضة وتطوير قاعدة الممارسين في المناطق.",
                BodyEn = "The Jizan centers championship featured strong competition among participating centers, supporting SMF’s regional development and participation goals.",
                Category = "events",
                ImageUrl = "/assets/uploads/news/20260708-120338-02643fae.jpg",
                PublishedAt = new DateTime(2026, 7, 8),
                IsPublished = true,
                Source = "SMF"
            },
            new NewsArticle
            {
                TitleAr = "ثلاث ميداليات برونزية سعودية في بطولة العالم الجامعية FISU — البرازيل 2026",
                TitleEn = "Saudi Muaythai claims three bronzes at FISU World University Championship Brasilia 2026",
                SummaryAr = "أول تمثيل سعودي جامعي عالمي يثمر ثلاث ميداليات برونزية في البرازيل.",
                SummaryEn = "Saudi Arabia’s first university world representation yields three bronze medals in Brazil.",
                BodyAr = "حقق المنتخب السعودي ثلاث ميداليات برونزية في بطولة العالم الجامعية للمواي تاي FISU في برازيليا 2026، في أول مشاركة جامعية عالمية رسمية للمملكة في هذه الرياضة.",
                BodyEn = "The Saudi team won three bronze medals at the FISU World University Muaythai Championship in Brasilia 2026 — the Kingdom’s first official university world appearance in the sport.",
                Category = "results",
                ImageUrl = "/assets/uploads/news/20260701-180441-8fc0575d.jpg",
                PublishedAt = new DateTime(2026, 7, 1),
                IsPublished = true,
                Source = "SMF"
            }
        );

        SeedIfmaNews(db, env);
    }

    private static void SeedIfmaNews(SmfDbContext db, IWebHostEnvironment env)
    {
        var path = ResolveDataFile(env, "ifma-news.json");
        if (path is null) return;

        var items = JsonSerializer.Deserialize<List<IfmaNewsSeed>>(
            File.ReadAllText(path),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];

        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item.TitleEn) || string.IsNullOrWhiteSpace(item.ExternalUrl))
                continue;

            var published = DateTime.TryParse(item.PublishedAt, out var dt)
                ? dt
                : new DateTime(2026, 7, 1);

            db.NewsArticles.Add(new NewsArticle
            {
                TitleAr = item.TitleEn,
                TitleEn = item.TitleEn,
                SummaryAr = item.SummaryEn ?? item.TitleEn,
                SummaryEn = item.SummaryEn ?? item.TitleEn,
                BodyAr = item.SummaryEn ?? item.TitleEn,
                BodyEn = item.SummaryEn ?? item.TitleEn,
                Category = "ifma",
                ImageUrl = item.ImageUrl,
                PublishedAt = published,
                IsPublished = true,
                Source = "IFMA",
                ExternalUrl = item.ExternalUrl
            });
        }
    }

    private static void SeedEvents(SmfDbContext db, IWebHostEnvironment env)
    {
        var path = ResolveDataFile(env, "events-2026.json");
        if (path is null)
            throw new FileNotFoundException("events-2026.json not found.");

        var items = JsonSerializer.Deserialize<List<EventSeed>>(
            File.ReadAllText(path),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];

        foreach (var e in items)
        {
            db.Events.Add(new EventItem
            {
                TitleAr = e.TitleAr,
                TitleEn = e.TitleEn,
                DescriptionAr = e.TitleAr,
                DescriptionEn = e.TitleEn,
                Category = e.Category,
                StartDate = DateTime.Parse(e.Start),
                EndDate = DateTime.Parse(e.End),
                LocationAr = e.LocationAr,
                LocationEn = e.LocationEn,
                Status = e.Status,
                IsPublished = true
            });
        }
    }

    /// <summary>
    /// Whether the fabricated clubs in <see cref="SeedClubs"/> may be inserted.
    ///
    /// Off outside development, because those clubs are published on a public
    /// page: a visitor could otherwise try to contact or drive to a facility
    /// that does not exist. <c>Seed:DemoClubs</c> overrides it in either
    /// direction, so a staging or demo instance can opt in deliberately.
    /// </summary>
    private static bool AllowDemoClubs(IWebHostEnvironment env, IConfiguration? config) =>
        config?.GetValue<bool?>("Seed:DemoClubs") ?? env.IsDevelopment();

    /// <summary>
    /// Sample clubs for the public "Try Muaythai" directory, so it renders
    /// populated before any real club has been approved.
    ///
    /// Two things are deliberate. Every address is under <c>example.com</c>,
    /// which RFC 2606 reserves precisely so it can never resolve to a real
    /// organisation. And no owner names, ID numbers, or personal mobiles are
    /// invented — the directory never publishes them, so fabricated identity
    /// data would sit in the database earning nothing.
    ///
    /// Each row carries an internal note marking it as demo data, so whoever
    /// runs the admin dashboard can tell these apart from real applications.
    /// </summary>
    private static void SeedClubs(SmfDbContext db)
    {
        // Eastern Province appears twice on purpose: it gives the region filter
        // something to actually group.
        var clubs = new[]
        {
            ("riyadh-muaythai",      "نادي الرياض للمواي تاي",            "Riyadh Muaythai Club",         "club",    "منطقة الرياض",          "الرياض",         "حي الرفيعة",   "مجمع الأمير فيصل بن فهد الأولمبي، شارع الديوان", "رجال، نساء، ناشئين",   "السبت والاثنين والأربعاء، 5 م – 10 م"),
            ("jeddah-muaythai",      "أكاديمية جدة للمواي تاي",           "Jeddah Muaythai Academy",      "academy", "منطقة مكة المكرمة",     "جدة",            "حي الروضة",     "شارع الأمير سلطان، مقابل حديقة الروضة",          "رجال، ناشئين، أطفال",  "الأحد إلى الخميس، 4 م – 9 م"),
            ("dammam-muaythai",      "مركز الدمام للمواي تاي",            "Dammam Muaythai Centre",       "center",  "المنطقة الشرقية",       "الدمام",         "حي الفيصلية",   "طريق الملك فهد، مجمع الفيصلية الرياضي",          "رجال، نساء",           "السبت والاثنين والأربعاء، 6 م – 11 م"),
            ("khobar-combat",        "نادي الخبر القتالي",                "Khobar Combat Club",           "club",    "المنطقة الشرقية",       "الخبر",          "حي العقربية",   "شارع الأمير تركي، برج العقربية",                 "رجال، ناشئين",         "يومياً عدا الجمعة، 5 م – 10 م"),
            ("madinah-martial-arts", "أكاديمية المدينة للفنون القتالية",  "Madinah Martial Arts Academy", "academy", "منطقة المدينة المنورة", "المدينة المنورة", "حي قباء",       "طريق قباء، مركز قباء الرياضي",                   "رجال، ناشئين، أطفال",  "الأحد والثلاثاء والخميس، 4:30 م – 9:30 م"),
            ("abha-muaythai",        "مركز أبها للمواي تاي",              "Abha Muaythai Centre",         "center",  "منطقة عسير",            "أبها",           "حي المنسك",     "طريق الملك عبدالعزيز، مركز أبها الرياضي",        "رجال، نساء، ناشئين",   "السبت إلى الأربعاء، 5 م – 10 م"),
            ("qassim-muaythai",      "نادي القصيم للمواي تاي",            "Qassim Muaythai Club",         "club",    "منطقة القصيم",          "بريدة",          "حي الصفراء",    "طريق الملك عبدالله، مجمع بريدة الرياضي",         "رجال، ناشئين",         "الأحد والثلاثاء والخميس، 6 م – 10 م"),
        };

        for (var i = 0; i < clubs.Length; i++)
        {
            var (slug, nameAr, nameEn, entityType, region, city, district, address, categories, schedule) = clubs[i];

            // Stagger the dates so the directory's "oldest approved first"
            // ordering is stable and looks like a real intake queue.
            var createdAt = DateTime.UtcNow.AddDays(-90 + (i * 9));

            var payload = new Dictionary<string, string>
            {
                ["nameAr"] = nameAr,
                ["nameEn"] = nameEn,
                ["entityType"] = entityType,
                ["region"] = region,
                ["city"] = city,
                ["district"] = district,
                ["shortAddress"] = address,
                ["googleMapsUrl"] = "https://www.google.com/maps/search/?api=1&query=" + Uri.EscapeDataString(nameAr),
                ["officialEmail"] = $"info@{slug}.example.com",
                ["clubWebsite"] = $"https://{slug}.example.com",
                ["categoriesAccepted"] = categories,
                ["trainingSchedule"] = schedule,
            };

            var registration = new Registration
            {
                Type = "club",
                PayloadJson = JsonSerializer.Serialize(payload),
                Status = RegistrationStatuses.Approved,
                MembershipNumber = $"SMF-CLUB-{i + 1:D3}",
                InternalNotes = "بيانات تجريبية للعرض — يمكن حذفها. Demo seed data; safe to delete.",
                CreatedAt = createdAt,
                StatusChangedAt = createdAt.AddDays(5),
                ApprovedAt = createdAt.AddDays(5),
            };

            // A reference number embeds the row id, so it can only be built
            // after the insert. Save one row at a time and fill the reference
            // in immediately: ReferenceNumber is unique, and a batch insert
            // would leave several rows sharing the empty default. This is the
            // same insert-then-label order the submission endpoint uses.
            db.Registrations.Add(registration);
            db.SaveChanges();

            registration.ReferenceNumber = $"SMF-C-{registration.CreatedAt:yyMMdd}-{registration.Id:D4}";
            db.SaveChanges();
        }
    }

    private static string? ResolveDataFile(IWebHostEnvironment env, string fileName)
    {
        var candidates = new[]
        {
            Path.Combine(env.ContentRootPath, fileName),
            Path.Combine(AppContext.BaseDirectory, fileName),
            Path.Combine(env.ContentRootPath, "Data", fileName)
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    private sealed class EventSeed
    {
        public string TitleAr { get; set; } = "";
        public string TitleEn { get; set; } = "";
        public string Category { get; set; } = "community";
        public string Start { get; set; } = "";
        public string End { get; set; } = "";
        public string LocationAr { get; set; } = "";
        public string LocationEn { get; set; } = "";
        public string Status { get; set; } = "confirmed";
    }

    private sealed class IfmaNewsSeed
    {
        public string TitleEn { get; set; } = "";
        public string? SummaryEn { get; set; }
        public string? ImageUrl { get; set; }
        public string? PublishedAt { get; set; }
        public string ExternalUrl { get; set; } = "";
    }
}
