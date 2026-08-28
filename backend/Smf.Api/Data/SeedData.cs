using System.Text.Json;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Data;

public static class SeedData
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static void Initialize(SmfDbContext db, IWebHostEnvironment env, ILogger? logger = null, IConfiguration? config = null)
    {
        db.Database.EnsureCreated();

        // EnsureCreated only ever builds the schema once, so databases created
        // before a model gained a column keep failing on insert. Add anything
        // missing before the app starts serving.
        SqliteSchemaGuard.EnsureColumns(db, logger);

        if (!db.AdminUsers.Any())
        {
            SeedAdminUser(db);
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

        // Memberships approved before the term/stage columns existed carry no
        // expiry and a default stage, so they would never lapse and the console
        // would show them stuck at stage 1. Backfill once, idempotently.
        BackfillMembershipTerms(db, logger);

        if (!db.Results.Any())
        {
            SeedResults(db, env);
        }

        // Results seeded before the Arabic name columns existed hold empty
        // strings, and SeedResults only runs on an empty table, so they would
        // stay English-only forever. Fill them from the same source file.
        BackfillResultNames(db, env, logger);

        if (!db.Pages.Any())
        {
            SeedPages(db);
        }

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
    private static void BackfillMembershipTerms(SmfDbContext db, ILogger? logger)
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
            registration.ExpiresAt = approvedAt.AddYears(MembershipTracks.TermYears(registration.Type));
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

    private static void SeedAdminUser(SmfDbContext db)
    {
        var (hash, salt) = PasswordHasher.HashPassword("Admin@123");
        db.AdminUsers.Add(new AdminUser
        {
            Username = "admin",
            PasswordHash = hash,
            PasswordSalt = salt,
            DisplayName = "مدير النظام / System Administrator",
            Role = AdminRoles.SuperAdmin,
            CreatedAt = DateTime.UtcNow
        });
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

        foreach (var role in MembershipRoles.Definitions)
        {
            var username = role.Key;
            if (db.AdminUsers.Any(u => u.Username == username)) continue;

            var (hash, salt) = PasswordHasher.HashPassword(password);
            db.AdminUsers.Add(new AdminUser
            {
                Username = username,
                PasswordHash = hash,
                PasswordSalt = salt,
                DisplayName = $"{role.NameAr} / {role.NameEn}",

                // Deliberately not a site-area role: §6 permissions must come
                // from the membership role alone, so these accounts prove the
                // register cannot be reached through any other grant.
                Role = AdminRoles.PeopleRegistry,
                MembershipRole = role.Key,
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

    private static void SeedPages(SmfDbContext db)
    {
        db.Pages.AddRange(
            BuildPage("home", BuildHomePage()),
            BuildPage("overview", BuildOverviewPage()),
            BuildPage("history", BuildHistoryPage()),
            BuildPage("values", BuildValuesPage()),
            BuildPage("strategy", BuildStrategyPage()),
            BuildPage("initiatives", BuildInitiativesPage()),
            BuildPage("goals", BuildGoalsPage()),
            BuildPage("achievements", BuildAchievementsPage())
        );
    }

    private static PageContent BuildPage(string slug, PageContentDoc doc) => new()
    {
        Slug = slug,
        ContentJson = JsonSerializer.Serialize(doc, JsonOptions),
        UpdatedAt = DateTime.UtcNow
    };

    private static Dictionary<string, object?> Item(params (string Key, object? Value)[] pairs)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var (key, value) in pairs) dict[key] = value;
        return dict;
    }

    private static PageContentDoc BuildHomePage() => new()
    {
        Meta = new MetaBlock { TitleAr = "الرئيسية", TitleEn = "Home" },
        Hero = new HeroBlock
        {
            HeadingAr = "الاتحاد السعودي للموي تاي",
            HeadingEn = "Saudi Muaythai Federation",
            SubAr = "الجهة الرسمية المشرفة على رياضة الموي تاي في المملكة العربية السعودية، نحو بطولة عالمية وقاعدة رياضية واسعة.",
            SubEn = "The official governing body for Muaythai in the Kingdom of Saudi Arabia — building champions and growing the sport nationwide.",
            Stats = new List<Dictionary<string, object?>>
            {
                Item(("value", "2019"), ("labelAr", "عام التأسيس"), ("labelEn", "Founded")),
                Item(("value", "72"), ("labelAr", "ميدالية دولية"), ("labelEn", "International Medals")),
                Item(("value", "13"), ("labelAr", "لجنة إقليمية"), ("labelEn", "Regional Committees")),
                Item(("value", "IFMA"), ("labelAr", "عضوية معتمدة"), ("labelEn", "Accredited Membership"))
            }
        },
        Sections = new List<Section>
        {
            new()
            {
                Type = "highlights",
                TitleAr = "أبرز الإنجازات",
                TitleEn = "Highlights",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("icon", "trophy"), ("titleAr", "7 ذهبيات دولية"), ("titleEn", "7 International Golds"),
                        ("descAr", "في البطولات العالمية والألعاب متعددة الرياضات منذ 2019"),
                        ("descEn", "Across world championships and multi-sport games since 2019")),
                    Item(("icon", "users"), ("titleAr", "نمو الأندية والمنتسبين"), ("titleEn", "Growing Clubs & Members"),
                        ("descAr", "توسع في عدد الأندية المرخصة والمنتسبين في جميع مناطق المملكة"),
                        ("descEn", "Expanding licensed clubs and members across all regions of the Kingdom")),
                    Item(("icon", "globe"), ("titleAr", "حضور دولي متنامٍ"), ("titleEn", "Growing International Presence"),
                        ("descAr", "مشاركات في بطولات الاتحاد الدولي IFMA والألعاب العسكرية والجامعية"),
                        ("descEn", "Participation in IFMA championships, military and university games"))
                }
            },
            new()
            {
                Type = "cta",
                TitleAr = "انضم إلينا",
                TitleEn = "Join Us",
                BodyAr = "سجّل كلاعب أو نادٍ أو مدرب أو مسؤول وكن جزءًا من مسيرة الموي تاي السعودي.",
                BodyEn = "Register as an athlete, club, coach or official and be part of Saudi Muaythai's journey."
            }
        }
    };

    private static PageContentDoc BuildOverviewPage() => new()
    {
        Meta = new MetaBlock { TitleAr = "نبذة عن الاتحاد", TitleEn = "Federation Overview" },
        Hero = new HeroBlock
        {
            HeadingAr = "من نحن",
            HeadingEn = "Who We Are",
            SubAr = "الاتحاد السعودي للموي تاي هو الجهة الرسمية المعتمدة من وزارة الرياضة واللجنة الأولمبية والبارالمبية السعودية للإشراف على رياضة الموي تاي بكافة مستوياتها.",
            SubEn = "The Saudi Muaythai Federation (SMF) is the officially licensed body, recognized by the Ministry of Sport and the Saudi Olympic & Paralympic Committee, responsible for governing Muaythai at every level."
        },
        Sections = new List<Section>
        {
            new()
            {
                Type = "richtext",
                TitleAr = "الهوية والتأسيس",
                TitleEn = "Identity & Establishment",
                BodyAr = "تأسس الاتحاد السعودي للموي تاي عام 2019 كجهة رياضية غير ربحية مرخصة من وزارة الرياضة، ويُعد العضو الرسمي الممثل للمملكة العربية السعودية في الاتحاد الدولي للموي تاي (IFMA) والهيئات الدولية المعنية بالرياضة. يتولى الاتحاد الإشراف الكامل على المنتخبات الوطنية، وتنظيم البطولات المحلية، وترخيص الأندية، وتأهيل المدربين والحكام وفق أعلى المعايير الفنية والإدارية.",
                BodyEn = "The Saudi Muaythai Federation was established in 2019 as a non-profit sports body licensed by the Ministry of Sport, and is the official representative of the Kingdom of Saudi Arabia within the International Federation of Muaythai Associations (IFMA) and other relevant international sporting bodies. The federation oversees the national teams, organizes domestic championships, licenses clubs, and trains coaches and referees to the highest technical and administrative standards."
            },
            new()
            {
                Type = "richtext",
                TitleAr = "الرؤية",
                TitleEn = "Vision",
                BodyAr = "أن تكون رياضة المواي تاي في المملكة نموذجاً رياضياً رائداً محلياً وعالمياً.",
                BodyEn = "For Muaythai in the Kingdom to be a leading sporting model, both locally and globally."
            },
            new()
            {
                Type = "richtext",
                TitleAr = "الرسالة",
                TitleEn = "Mission",
                BodyAr = "تمكين ممارسي رياضة المواي تاي، وتطوير بيئة تنافسية مستدامة تدعم النجاحات الرياضية الوطنية والعالمية.",
                BodyEn = "Empowering Muaythai practitioners and developing a sustainable competitive environment that supports national and international sporting success."
            },
            new()
            {
                Type = "cards",
                TitleAr = "أبرز مهام الاتحاد",
                TitleEn = "Core Mandates",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("titleAr", "تنظيم البطولات الوطنية"), ("titleEn", "Organizing National Championships"),
                        ("descAr", "إشراف كامل على البطولات والدوريات المحلية على مستوى الأندية والمنتخبات"),
                        ("descEn", "Full oversight of local club and national-team championships and leagues")),
                    Item(("titleAr", "ترخيص الأندية والمنتسبين"), ("titleEn", "Licensing Clubs & Members"),
                        ("descAr", "اعتماد الأندية وتسجيل اللاعبين والمدربين والحكام والمسؤولين"),
                        ("descEn", "Accrediting clubs and registering athletes, coaches, referees and officials")),
                    Item(("titleAr", "تأهيل الكوادر الفنية"), ("titleEn", "Technical Capacity-Building"),
                        ("descAr", "برامج تدريب وترخيص للمدربين والحكام وفق معايير الاتحاد الدولي IFMA"),
                        ("descEn", "Training and certification programs for coaches and referees per IFMA standards")),
                    Item(("titleAr", "تمثيل المملكة دوليًا"), ("titleEn", "Representing the Kingdom Internationally"),
                        ("descAr", "إشراف على المنتخبات الوطنية في البطولات القارية والعالمية"),
                        ("descEn", "Overseeing national teams at continental and world championships"))
                }
            },
            new()
            {
                Type = "stats",
                TitleAr = "الاتحاد بالأرقام",
                TitleEn = "The Federation in Numbers",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("value", "2019"), ("labelAr", "عام الترخيص"), ("labelEn", "Licensed in")),
                    Item(("value", "72"), ("labelAr", "ميدالية دولية"), ("labelEn", "International Medals")),
                    Item(("value", "5"), ("labelAr", "قيم مؤسسية"), ("labelEn", "Core Values")),
                    Item(("value", "8"), ("labelAr", "مبادرات استراتيجية"), ("labelEn", "Strategic Initiatives"))
                }
            }
        }
    };

    private static PageContentDoc BuildHistoryPage() => new()
    {
        Meta = new MetaBlock { TitleAr = "مسيرة الاتحاد", TitleEn = "Our History" },
        Hero = new HeroBlock
        {
            HeadingAr = "مسيرة الاتحاد",
            HeadingEn = "Our Journey",
            SubAr = "من التأسيس إلى المنصات العالمية: محطات الاتحاد السعودي للموي تاي عبر السنين.",
            SubEn = "From establishment to the world's podiums: milestones of the Saudi Muaythai Federation through the years."
        },
        Sections = new List<Section>
        {
            new()
            {
                Type = "timeline",
                TitleAr = "الخط الزمني 2019 - 2026",
                TitleEn = "Timeline 2019 - 2026",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("year", "2019"), ("titleAr", "التأسيس والانطلاقة"), ("titleEn", "Establishment & Launch"),
                        ("descAr", "تأسيس الاتحاد السعودي للموي تاي برخصة رسمية من وزارة الرياضة، وتشكيل أول مجلس إدارة، وانطلاق أولى دورات تأهيل المدربين. وفي أول ظهور دولي حقق أبطال المملكة 3 ميداليات برونزية في بطولة تشونغجو العالمية للفنون القتالية بكوريا الجنوبية."),
                        ("descEn", "The Saudi Muaythai Federation was officially licensed by the Ministry of Sport, its first board was formed, and the earliest coach-education courses launched. In its first international appearance, Saudi athletes won 3 bronze medals at the Chungju World Martial Arts Masterships in South Korea.")),
                    Item(("year", "2020"), ("titleAr", "بناء الأنظمة المؤسسية"), ("titleEn", "Building Institutional Foundations"),
                        ("descAr", "اعتماد اللائحة الأساسية وأنظمة الترخيص والانضباط، وبدء التسجيل الرسمي للأندية واللاعبين، إلى جانب استكمال إجراءات العضوية في الاتحاد الدولي للموي تاي IFMA."),
                        ("descEn", "Adoption of the federation's bylaws, licensing and disciplinary regulations, launch of official club and athlete registration, and completion of membership procedures with the International Federation of Muaythai Associations (IFMA).")),
                    Item(("year", "2021"), ("titleAr", "العودة إلى المنصات الدولية"), ("titleEn", "Return to the International Stage"),
                        ("descAr", "مشاركة المنتخب الوطني في بطولة الاتحاد الدولي للموي تاي بتايلاند، وتحقيق ميداليتين برونزيتين وميدالية فضية، في مؤشر مبكر على تنامي المستوى الفني للاعبي المملكة."),
                        ("descEn", "The national team competed at the IFMA World Championships in Thailand, winning two bronze medals and a silver medal — an early sign of the rising technical level of the Kingdom's athletes.")),
                    Item(("year", "2022"), ("titleAr", "توسّع الحضور الدولي"), ("titleEn", "Expanding International Presence"),
                        ("descAr", "عام استثنائي بمشاركات في بطولة IFMA العالمية للناشئين وبطولة الجراند سلام العالمية بماليزيا، أسفرت عن حصاد 20 ميدالية، مع إطلاق أولى اللجان الإقليمية للاتحاد في عدد من مناطق المملكة."),
                        ("descEn", "An exceptional year with participation at the IFMA Youth World Championships and the World Muaythai Grand Slam in Malaysia, yielding 20 medals, alongside the launch of the federation's first regional committees across several regions of the Kingdom.")),
                    Item(("year", "2023"), ("titleAr", "أول ذهبية عالمية وألعاب القتال العالمية بالرياض"), ("titleEn", "First World Gold & the World Combat Games in Riyadh"),
                        ("descAr", "تحقيق أول ميدالية ذهبية في تاريخ الاتحاد على يد البطلة هتان السف في بطولة IFMA العالمية للكبار ببانكوك، ثم تتويج المملكة بثلاث ذهبيات على أرضها خلال استضافة الرياض لألعاب القتال العالمية 2023، إلى جانب إطلاق الدوري السعودي للموي تاي."),
                        ("descEn", "The federation's first-ever gold medal was won by champion Hattan Alsaif at the IFMA Senior World Championships in Bangkok. The Kingdom then claimed three golds on home soil as Riyadh hosted the World Combat Games 2023, alongside the launch of the Saudi Muaythai League.")),
                    Item(("year", "2024"), ("titleAr", "استمرار صعود المنتخبات الوطنية"), ("titleEn", "The National Teams' Continued Rise"),
                        ("descAr", "مشاركات قوية في بطولة IFMA العالمية للكبار باليونان وبطولة الناشئين العالمية ببانكوك، بحصاد إضافي من الميداليات الذهبية والفضية والبرونزية، مع توسّع برامج تأهيل المدربين والحكام."),
                        ("descEn", "Strong showings at the IFMA Senior World Championships in Greece and the Youth World Championship in Bangkok added further gold, silver and bronze medals, alongside expanding coach and referee education programs.")),
                    Item(("year", "2025"), ("titleAr", "عام قياسي على الساحة الدولية"), ("titleEn", "A Record-Breaking International Year"),
                        ("descAr", "استضافة الرياض لدورة الألعاب الإسلامية التضامنية 2025، ومشاركات في ألعاب الجيوش العالمية CISM ببانكوك وبطولة IFMA العالمية للناشئين بأبوظبي، ليحقق المنتخب أكبر حصاد ميداليات سنوي في تاريخ الاتحاد."),
                        ("descEn", "Riyadh hosted the 2025 Islamic Solidarity Games, with further participation at the CISM Military World Games in Bangkok and the IFMA Youth World Championship in Abu Dhabi, delivering the federation's largest annual medal haul yet.")),
                    Item(("year", "2026"), ("titleAr", "استراتيجية جديدة وآفاق جامعية"), ("titleEn", "A New Strategy & University Sport Horizons"),
                        ("descAr", "إطلاق الاستراتيجية الجديدة للاتحاد حتى 2030، ومشاركة أولى في الألعاب الجامعية العالمية FISU بالبرازيل، إلى جانب توسيع شبكة معسكرات التدريب الإقليمية والمبادرات المجتمعية."),
                        ("descEn", "Launch of the federation's new strategy through 2030, a first-ever appearance at the FISU World University Games in Brazil, and continued expansion of the regional training-camp network and community initiatives."))
                }
            }
        }
    };

    private static PageContentDoc BuildValuesPage() => new()
    {
        Meta = new MetaBlock { TitleAr = "قيمنا المؤسسية", TitleEn = "Our Core Values" },
        Hero = new HeroBlock
        {
            HeadingAr = "قيمنا المؤسسية",
            HeadingEn = "Our Core Values",
            SubAr = "خمس قيم تشكل هوية الاتحاد السعودي للموي تاي وتوجّه سلوك منتسبيه.",
            SubEn = "Five values that shape the identity of the Saudi Muaythai Federation and guide the conduct of everyone within it."
        },
        Sections = new List<Section>
        {
            new()
            {
                Type = "cards",
                TitleAr = "القيم الخمس",
                TitleEn = "The Five Pillars",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("icon", "medal"), ("titleAr", "التميّز"), ("titleEn", "Excellence"),
                        ("descAr", "السعي الدائم لأعلى مستويات الأداء الفني والإداري والرياضي في كل ما نقوم به"),
                        ("descEn", "A constant pursuit of the highest standards of technical, administrative and athletic performance in everything we do")),
                    Item(("icon", "shield-check"), ("titleAr", "النزاهة"), ("titleEn", "Integrity"),
                        ("descAr", "الالتزام بالشفافية والعدالة ومكافحة المنشطات في جميع قرارات ومنافسات الاتحاد"),
                        ("descEn", "Commitment to transparency, fairness and anti-doping compliance across all federation decisions and competitions")),
                    Item(("icon", "users"), ("titleAr", "روح الفريق"), ("titleEn", "Teamwork"),
                        ("descAr", "تكامل الجهود بين الاتحاد والأندية واللجان الإقليمية والشركاء لتحقيق أهداف مشتركة"),
                        ("descEn", "Combining the efforts of the federation, clubs, regional committees and partners to achieve shared goals")),
                    Item(("icon", "heart-handshake"), ("titleAr", "الاحترام"), ("titleEn", "Respect"),
                        ("descAr", "احترام اللاعبين والمدربين والحكام والجمهور، وترسيخ الروح الرياضية داخل الحلبة وخارجها"),
                        ("descEn", "Respecting athletes, coaches, referees and fans, and embedding sportsmanship inside and outside the ring")),
                    Item(("icon", "lightbulb"), ("titleAr", "الابتكار"), ("titleEn", "Innovation"),
                        ("descAr", "تبنّي أساليب حديثة في التدريب والإدارة والتحول الرقمي لمواكبة تطور الرياضة عالميًا"),
                        ("descEn", "Embracing modern methods in training, administration and digital transformation to keep pace with the sport's global evolution"))
                }
            }
        }
    };

    private static PageContentDoc BuildStrategyPage() => new()
    {
        Meta = new MetaBlock { TitleAr = "الاستراتيجية", TitleEn = "Strategy" },
        Hero = new HeroBlock
        {
            HeadingAr = "الاستراتيجية 2026 - 2030",
            HeadingEn = "Strategy 2026 - 2030",
            SubAr = "خارطة طريق الاتحاد لبناء منظومة موي تاي مستدامة ومنافسة عالميًا.",
            SubEn = "The federation's roadmap for building a sustainable, globally competitive Muaythai ecosystem."
        },
        Sections = new List<Section>
        {
            new()
            {
                Type = "richtext",
                TitleAr = "نظرة عامة",
                TitleEn = "Overview",
                BodyAr = "بُنيت استراتيجية الاتحاد السعودي للموي تاي على خمس ركائز رئيسية تستجيب لتطلعات رؤية المملكة 2030 في تنمية القطاع الرياضي، وتهدف إلى ترسيخ مكانة الموي تاي كرياضة قتالية رائدة محليًا وقارّيًا وعالميًا خلال السنوات القادمة.",
                BodyEn = "The Saudi Muaythai Federation's strategy is built on five core pillars aligned with Saudi Vision 2030's ambitions for the sports sector, aiming to establish Muaythai as a leading combat sport locally, regionally and globally in the years ahead."
            },
            new()
            {
                Type = "cards",
                TitleAr = "الركائز الاستراتيجية",
                TitleEn = "Strategic Pillars",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("titleAr", "تطوير اللاعبين والأداء الرياضي"), ("titleEn", "Athlete Development & High Performance"),
                        ("descAr", "بناء منظومة اكتشاف مواهب ومسارات إعداد متكاملة من الناشئين حتى المنتخبات الوطنية"),
                        ("descEn", "Building a talent-identification system and complete development pathways from youth to national teams")),
                    Item(("titleAr", "الحوكمة والتميز المؤسسي"), ("titleEn", "Governance & Institutional Excellence"),
                        ("descAr", "ترسيخ الشفافية والامتثال وتطوير الهيكل الإداري والأنظمة الداخلية للاتحاد"),
                        ("descEn", "Embedding transparency, compliance, and developing the federation's administrative structure and internal regulations")),
                    Item(("titleAr", "الانتشار المجتمعي والقاعدة الرياضية"), ("titleEn", "Grassroots & Community Growth"),
                        ("descAr", "توسيع قاعدة الممارسين عبر الأندية والمدارس والجامعات في جميع مناطق المملكة"),
                        ("descEn", "Expanding the participant base through clubs, schools and universities across all regions of the Kingdom")),
                    Item(("titleAr", "الحضور الدولي والشراكات"), ("titleEn", "International Presence & Partnerships"),
                        ("descAr", "تعزيز مكانة المملكة داخل الاتحاد الدولي IFMA وبناء شراكات مع اتحادات ومنظمات عالمية"),
                        ("descEn", "Strengthening the Kingdom's standing within IFMA and building partnerships with international federations and organizations")),
                    Item(("titleAr", "الاستدامة والنمو التجاري"), ("titleEn", "Sustainability & Commercial Growth"),
                        ("descAr", "تنويع مصادر الدخل عبر الرعاية والاستثمار التجاري لضمان استدامة الاتحاد ماليًا"),
                        ("descEn", "Diversifying revenue through sponsorship and commercial investment to ensure the federation's financial sustainability"))
                }
            },
            new()
            {
                Type = "stats",
                TitleAr = "مؤشرات الأداء الرئيسية",
                TitleEn = "Key Performance Indicators",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("value", "+50%"), ("labelAr", "نمو الأندية المرخصة"), ("labelEn", "Growth in Licensed Clubs")),
                    Item(("value", "Top 3"), ("labelAr", "الترتيب الآسيوي المستهدف"), ("labelEn", "Targeted Asian Ranking")),
                    Item(("value", "30%"), ("labelAr", "نسبة مشاركة المرأة المستهدفة"), ("labelEn", "Targeted Women's Participation"))
                }
            }
        }
    };

    private static PageContentDoc BuildInitiativesPage() => new()
    {
        Meta = new MetaBlock { TitleAr = "المبادرات الاستراتيجية", TitleEn = "Strategic Initiatives" },
        Hero = new HeroBlock
        {
            HeadingAr = "المبادرات الاستراتيجية",
            HeadingEn = "Strategic Initiatives",
            SubAr = "ثماني مبادرات تترجم استراتيجية الاتحاد إلى برامج عمل ملموسة.",
            SubEn = "Eight initiatives translating the federation's strategy into concrete programs."
        },
        Sections = new List<Section>
        {
            new()
            {
                Type = "list",
                TitleAr = "المبادرات الثماني",
                TitleEn = "The Eight Initiatives",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("titleAr", "برنامج اكتشاف المواهب الوطني"), ("titleEn", "National Talent Identification Program"),
                        ("descAr", "مسح ميداني في المدارس والأندية لاكتشاف المواهب الواعدة وضمها لمسارات الإعداد المبكر"),
                        ("descEn", "Field scouting in schools and clubs to identify promising talent and enroll them in early development pathways")),
                    Item(("titleAr", "أكاديمية اعتماد المدربين والحكام"), ("titleEn", "Coach & Referee Certification Academy"),
                        ("descAr", "برامج تدريب وترخيص معتمدة من IFMA لرفع كفاءة الكوادر الفنية والتحكيمية"),
                        ("descEn", "IFMA-accredited training and licensing programs to raise the competence of coaches and referees")),
                    Item(("titleAr", "الموي تاي في المدارس والجامعات"), ("titleEn", "School & University Muaythai Program"),
                        ("descAr", "إدخال رياضة الموي تاي ضمن الأنشطة اللامنهجية بالمدارس والجامعات لتوسيع القاعدة الشبابية"),
                        ("descEn", "Introducing Muaythai as an extracurricular activity in schools and universities to widen the youth base")),
                    Item(("titleAr", "برنامج تطوير الموي تاي النسائي"), ("titleEn", "Women's Muaythai Development Program"),
                        ("descAr", "مسارات تدريب وتحكيم ومنافسات مخصصة لتمكين مشاركة المرأة في الرياضة"),
                        ("descEn", "Dedicated training, officiating and competition pathways to empower women's participation in the sport")),
                    Item(("titleAr", "الدوري السعودي للموي تاي"), ("titleEn", "Saudi Muaythai League"),
                        ("descAr", "دوري أندية سنوي يرفع مستوى المنافسة المحلية ويهيئ اللاعبين للاستحقاقات الدولية"),
                        ("descEn", "An annual club league that raises the level of domestic competition and prepares athletes for international events")),
                    Item(("titleAr", "برنامج دمج ذوي الإعاقة (بارا موي تاي)"), ("titleEn", "Para-Muaythai Inclusion Program"),
                        ("descAr", "فتح مسارات تدريب ومنافسة لرياضيي الإعاقة تماشيًا مع فئات البطولات الدولية"),
                        ("descEn", "Opening training and competition pathways for para-athletes in line with international championship categories")),
                    Item(("titleAr", "شبكة معسكرات التدريب الإقليمية"), ("titleEn", "Regional Training Camps Network"),
                        ("descAr", "معسكرات دورية في مناطق المملكة لرفع الجاهزية البدنية والفنية للمنتخبات والأندية"),
                        ("descEn", "Periodic camps across the Kingdom's regions to raise the physical and technical readiness of national teams and clubs")),
                    Item(("titleAr", "منصة التحول الرقمي والتفاعل مع الجماهير"), ("titleEn", "Digital Transformation & Fan Engagement Platform"),
                        ("descAr", "أنظمة رقمية للتسجيل والترخيص والبطولات، ومنصات تفاعلية لتقريب الجماهير من الرياضة"),
                        ("descEn", "Digital systems for registration, licensing and competitions, plus interactive platforms bringing fans closer to the sport"))
                }
            }
        }
    };

    private static PageContentDoc BuildGoalsPage() => new()
    {
        Meta = new MetaBlock { TitleAr = "الأهداف الاستراتيجية", TitleEn = "Strategic Goals" },
        Hero = new HeroBlock
        {
            HeadingAr = "الأهداف الاستراتيجية",
            HeadingEn = "Strategic Goals",
            SubAr = "سبعة أهداف قابلة للقياس توجّه عمل الاتحاد حتى عام 2030.",
            SubEn = "Seven measurable goals guiding the federation's work through 2030."
        },
        Sections = new List<Section>
        {
            new()
            {
                Type = "list",
                TitleAr = "الأهداف السبعة",
                TitleEn = "The Seven Goals",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("titleAr", "توسيع قاعدة الأندية والمنتسبين"), ("titleEn", "Expand the Base of Clubs & Members"),
                        ("descAr", "زيادة عدد الأندية المرخصة والمنتسبين المسجلين في جميع مناطق المملكة"),
                        ("descEn", "Increase the number of licensed clubs and registered members across all regions of the Kingdom")),
                    Item(("titleAr", "الوصول لمراكز متقدمة آسيويًا وعالميًا"), ("titleEn", "Reach Advanced Asian & World Rankings"),
                        ("descAr", "تحقيق مركز ضمن أفضل 3 اتحادات آسيويًا بحلول عام 2030"),
                        ("descEn", "Achieving a top-3 ranking among Asian federations by 2030")),
                    Item(("titleAr", "تمكين مشاركة المرأة"), ("titleEn", "Empower Women's Participation"),
                        ("descAr", "رفع نسبة مشاركة اللاعبات والمدربات والحكام من الإناث في جميع الأنشطة"),
                        ("descEn", "Increasing the share of female athletes, coaches and referees across all activities")),
                    Item(("titleAr", "بناء كوادر فنية معتمدة"), ("titleEn", "Build a Pipeline of Certified Technical Staff"),
                        ("descAr", "تخريج أعداد متزايدة من المدربين والحكام المعتمدين محليًا ودوليًا"),
                        ("descEn", "Graduating growing numbers of locally and internationally certified coaches and referees")),
                    Item(("titleAr", "استضافة فعاليات دولية كبرى"), ("titleEn", "Host Major International Events"),
                        ("descAr", "استضافة بطولة دولية كبرى واحدة على الأقل بحلول عام 2027"),
                        ("descEn", "Hosting at least one major international championship by 2027")),
                    Item(("titleAr", "تعزيز الحوكمة والامتثال"), ("titleEn", "Strengthen Governance & Compliance"),
                        ("descAr", "ترسيخ الشفافية ومكافحة المنشطات والامتثال الكامل لأنظمة الاتحاد الدولي"),
                        ("descEn", "Embedding transparency, anti-doping compliance and full alignment with IFMA regulations")),
                    Item(("titleAr", "تنويع مصادر الدخل"), ("titleEn", "Diversify Revenue Sources"),
                        ("descAr", "بناء شراكات رعاية واستثمار تجاري تدعم استدامة الاتحاد ماليًا"),
                        ("descEn", "Building sponsorship and commercial-investment partnerships to support the federation's financial sustainability"))
                }
            }
        }
    };

    private static PageContentDoc BuildAchievementsPage() => new()
    {
        Meta = new MetaBlock { TitleAr = "الإنجازات والميداليات", TitleEn = "Achievements & Medals" },
        Hero = new HeroBlock
        {
            HeadingAr = "الإنجازات والميداليات",
            HeadingEn = "Achievements & Medals",
            SubAr = "72 ميدالية دولية منذ عام 2019 تعكس الصعود المستمر لرياضة الموي تاي السعودية.",
            SubEn = "72 international medals since 2019 reflecting the steady rise of Saudi Muaythai.",
            Stats = new List<Dictionary<string, object?>>
            {
                Item(("value", "7"), ("labelAr", "ذهبية"), ("labelEn", "Gold")),
                Item(("value", "17"), ("labelAr", "فضية"), ("labelEn", "Silver")),
                Item(("value", "48"), ("labelAr", "برونزية"), ("labelEn", "Bronze")),
                Item(("value", "72"), ("labelAr", "إجمالي الميداليات"), ("labelEn", "Total Medals"))
            }
        },
        Sections = new List<Section>
        {
            new()
            {
                Type = "timeline",
                TitleAr = "أبرز المحطات",
                TitleEn = "Landmark Moments",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("year", "2019"), ("titleAr", "أول ميداليات دولية"), ("titleEn", "First International Medals"),
                        ("descAr", "3 ميداليات برونزية في بطولة تشونغجو العالمية للفنون القتالية بكوريا الجنوبية"),
                        ("descEn", "3 bronze medals at the Chungju World Martial Arts Masterships, South Korea")),
                    Item(("year", "2023"), ("titleAr", "أول ذهبية في تاريخ الاتحاد"), ("titleEn", "The Federation's First-Ever Gold"),
                        ("descAr", "هتان السف تُتوّج بذهبية بطولة IFMA العالمية للكبار ببانكوك ضمن فئة تحت 23 سنة -45 كجم"),
                        ("descEn", "Hattan Alsaif claims gold at the IFMA Senior World Championships in Bangkok in the U23 -45kg category")),
                    Item(("year", "2023"), ("titleAr", "3 ذهبيات على أرض الوطن"), ("titleEn", "Three Golds on Home Soil"),
                        ("descAr", "استضافة الرياض لألعاب القتال العالمية شهدت تتويج هتان السف وعناد باعويضان بالذهب"),
                        ("descEn", "Riyadh's hosting of the World Combat Games saw Hattan Alsaif and Inad Baowaydhan crowned champions")),
                    Item(("year", "2025"), ("titleAr", "عام قياسي بالميداليات"), ("titleEn", "A Record Medal Year"),
                        ("descAr", "16 ميدالية خلال عام واحد عبر بطولة الناشئين العالمية وألعاب الجيوش العالمية والألعاب الإسلامية التضامنية"),
                        ("descEn", "16 medals in a single year across the Youth World Championship, CISM Military World Games and Islamic Solidarity Games")),
                    Item(("year", "2026"), ("titleAr", "أول ظهور جامعي عالمي"), ("titleEn", "First World University Games Appearance"),
                        ("descAr", "3 ميداليات برونزية في أول مشاركة للمملكة في الألعاب الجامعية العالمية FISU بالبرازيل"),
                        ("descEn", "3 bronze medals in the Kingdom's first-ever appearance at the FISU World University Games in Brazil"))
                }
            },
            new()
            {
                Type = "cards",
                TitleAr = "أبرز الأبطال",
                TitleEn = "Featured Champions",
                Items = new List<Dictionary<string, object?>>
                {
                    Item(("titleAr", "هتان السف"), ("titleEn", "Hattan Alsaif"),
                        ("descAr", "صاحبة أول ذهبية عالمية للاتحاد، وحاصلة على ذهبيتين وبرونزية دولية"),
                        ("descEn", "Winner of the federation's first world gold, with two golds and a bronze internationally")),
                    Item(("titleAr", "عناد باعويضان"), ("titleEn", "Inad Baowaydhan"),
                        ("descAr", "بطل ذهبية ألعاب القتال العالمية 2023 بالرياض فئة تحت 75 كجم"),
                        ("descEn", "2023 World Combat Games gold medalist in Riyadh, -75kg category")),
                    Item(("titleAr", "سُهى الفار"), ("titleEn", "Suha Alfar"),
                        ("descAr", "من أكثر اللاعبات تتويجًا بالميداليات على مدى الأعوام 2023-2026"),
                        ("descEn", "One of the most decorated athletes across 2023-2026"))
                }
            }
        }
    };
}
