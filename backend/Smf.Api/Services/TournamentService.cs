using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// Setting a tournament up and publishing it — Phase 3 REQ-01 and REQ-02.
///
/// Every refusal comes back as an <see cref="Outcome"/> in both languages
/// rather than as an exception, because all of them are things a person did
/// and can undo.
/// </summary>
public class TournamentService(SmfDbContext db, AuditLogger audit)
{
    public sealed record Outcome(bool Ok, int Status, string MessageAr, string MessageEn)
    {
        public static Outcome Success() => new(true, 200, string.Empty, string.Empty);
        public static Outcome Invalid(string ar, string en) => new(false, 400, ar, en);
        public static Outcome Conflict(string ar, string en) => new(false, 409, ar, en);
        public static Outcome NotFound() => new(false, 404, "غير موجود.", "Not found.");
    }

    /// <summary>What an authorised user sends when creating or editing a tournament.</summary>
    public sealed record Setup(
        string NameAr,
        string NameEn,
        string Type,
        string CompetitionType,
        string LocationAr,
        string LocationEn,
        DateTime StartDate,
        DateTime EndDate,
        TimeSpan FirstBoutTime,
        DateTime? RegistrationClosesAt,
        IReadOnlyList<string> Genders,
        IReadOnlyList<string> Categories);

    /* ── creation and editing ───────────────────────────────────────────── */

    public async Task<(Outcome Result, Tournament? Tournament)> CreateAsync(
        Setup setup,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (Validate(setup) is { Ok: false } invalid) return (invalid, null);

        var tournament = new Tournament
        {
            NameAr = setup.NameAr.Trim(),
            NameEn = setup.NameEn.Trim(),
            Type = setup.Type,
            CompetitionType = setup.CompetitionType,
            LocationAr = setup.LocationAr.Trim(),
            LocationEn = setup.LocationEn.Trim(),
            StartDate = setup.StartDate.Date,
            EndDate = setup.EndDate.Date,
            FirstBoutTime = setup.FirstBoutTime,
            // REQ-01 rule 9 — seven days before, unless told otherwise.
            RegistrationClosesAt = setup.RegistrationClosesAt
                ?? setup.StartDate.Date.AddDays(-Tournament.DefaultRegistrationCloseDays),
            Genders = string.Join(',', setup.Genders.Distinct()),
            Categories = string.Join(',', setup.Categories.Distinct()),
            Status = TournamentStatuses.Draft,
            CreatedBy = actor.Username,
            LastActionBy = actor.Username,
        };

        db.Tournaments.Add(tournament);
        await db.SaveChangesAsync(cancellationToken);

        await SyncDivisionsAsync(tournament, cancellationToken);

        audit.Write(actor, AuditActions.TournamentCreated, "tournament", tournament.Id, tournament.NameEn);
        await db.SaveChangesAsync(cancellationToken);

        return (Outcome.Success(), tournament);
    }

    public async Task<Outcome> UpdateAsync(
        Tournament tournament,
        Setup setup,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (Validate(setup) is { Ok: false } invalid) return invalid;

        // The categories and weights decide the divisions, and a division with
        // entries in it cannot simply vanish underneath them.
        var removing = await DivisionsLostBy(tournament, setup, cancellationToken);
        if (removing.Count > 0)
        {
            var names = string.Join(", ", removing.Select(d => d.Describe(arabic: false)));
            return Outcome.Conflict(
                $"لا يمكن إزالة فئات عليها تسجيلات: {names}.",
                $"These divisions already have entries and cannot be removed: {names}.");
        }

        tournament.NameAr = setup.NameAr.Trim();
        tournament.NameEn = setup.NameEn.Trim();
        tournament.Type = setup.Type;
        tournament.CompetitionType = setup.CompetitionType;
        tournament.LocationAr = setup.LocationAr.Trim();
        tournament.LocationEn = setup.LocationEn.Trim();
        tournament.StartDate = setup.StartDate.Date;
        tournament.EndDate = setup.EndDate.Date;
        tournament.FirstBoutTime = setup.FirstBoutTime;
        tournament.Genders = string.Join(',', setup.Genders.Distinct());
        tournament.Categories = string.Join(',', setup.Categories.Distinct());
        tournament.UpdatedAt = DateTime.UtcNow;
        tournament.LastActionBy = actor.Username;

        if (setup.RegistrationClosesAt is { } closes) tournament.RegistrationClosesAt = closes;

        await SyncDivisionsAsync(tournament, cancellationToken);

        audit.Write(actor, AuditActions.TournamentUpdated, "tournament", tournament.Id, tournament.NameEn);
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>REQ-01 rule 11 — publishing is what opens entries.</summary>
    public async Task<Outcome> PublishAsync(
        Tournament tournament,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (tournament.Status == TournamentStatuses.Published) return Outcome.Success();

        if (tournament.Status is not (TournamentStatuses.Draft or TournamentStatuses.Closed))
        {
            return Outcome.Conflict(
                "لا يمكن نشر بطولة في هذه الحالة.",
                "A tournament in this state cannot be published.");
        }

        var divisions = await db.TournamentDivisions
            .CountAsync(d => d.TournamentId == tournament.Id, cancellationToken);

        if (divisions == 0)
        {
            return Outcome.Invalid(
                "لا يمكن نشر بطولة بدون فئات وأوزان.",
                "A tournament cannot be published with no categories and weight classes.");
        }

        tournament.Status = TournamentStatuses.Published;
        tournament.PublishedAt ??= DateTime.UtcNow;
        tournament.LastActionBy = actor.Username;
        tournament.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.TournamentPublished, "tournament", tournament.Id, tournament.NameEn,
            toStatus: TournamentStatuses.Published);
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// REQ-01 rule 9 — an authorised user may push the closing date out. It is
    /// never pulled in silently: moving it earlier than now would close entries
    /// that are open, so that is refused.
    /// </summary>
    public async Task<Outcome> ExtendRegistrationAsync(
        Tournament tournament,
        DateTime closesAt,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (closesAt > tournament.StartDate)
        {
            return Outcome.Invalid(
                "لا يمكن أن يتجاوز إغلاق التسجيل تاريخ بداية البطولة.",
                "Entries cannot close after the tournament has started.");
        }

        var previous = tournament.RegistrationClosesAt;
        tournament.RegistrationClosesAt = closesAt;
        tournament.UpdatedAt = DateTime.UtcNow;
        tournament.LastActionBy = actor.Username;

        audit.Write(actor, AuditActions.TournamentUpdated, "tournament", tournament.Id, tournament.NameEn,
            details: $"Entries now close {closesAt:yyyy-MM-dd HH:mm} (was {previous:yyyy-MM-dd HH:mm}).");
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    public async Task<Outcome> ChangeStatusAsync(
        Tournament tournament,
        string status,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (!TournamentStatuses.All.Contains(status))
            return Outcome.Invalid("حالة غير معروفة.", "Unknown status.");

        var from = tournament.Status;
        tournament.Status = status;
        tournament.UpdatedAt = DateTime.UtcNow;
        tournament.LastActionBy = actor.Username;

        audit.Write(actor, AuditActions.TournamentUpdated, "tournament", tournament.Id, tournament.NameEn,
            fromStatus: from, toStatus: status);
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /* ── divisions (REQ-02) ─────────────────────────────────────────────── */

    /// <summary>
    /// Brings the tournament's divisions in line with the categories, genders
    /// and weight classes it is set up for.
    ///
    /// Additive by default: a division that already exists is left alone, and
    /// one that is no longer wanted is removed only when nothing has entered
    /// it. <see cref="UpdateAsync"/> refuses the edit before it gets here if
    /// that is not true, so this never destroys an entry.
    /// </summary>
    public async Task SyncDivisionsAsync(Tournament tournament, CancellationToken cancellationToken = default)
    {
        var categories = Split(tournament.Categories);
        var genders = Split(tournament.Genders);

        var wanted = TournamentEligibility
            .Plan(categories, genders, WeightClasses.For)
            .ToList();

        var existing = await db.TournamentDivisions
            .Where(d => d.TournamentId == tournament.Id)
            .ToListAsync(cancellationToken);

        foreach (var (category, gender, limit, floor) in wanted)
        {
            if (existing.Any(d => d.Category == category && d.Gender == gender && d.WeightLimitKg == limit))
                continue;

            db.TournamentDivisions.Add(new TournamentDivision
            {
                TournamentId = tournament.Id,
                Category = category,
                Gender = gender,
                WeightLimitKg = limit,
                WeightFloorKg = floor,
            });
        }

        var keep = wanted.Select(w => (w.Category, w.Gender, w.Limit)).ToHashSet();
        var entries = await db.TournamentEntries
            .Where(e => e.TournamentId == tournament.Id && e.DivisionId != null)
            .Select(e => e.DivisionId!.Value)
            .ToListAsync(cancellationToken);

        foreach (var division in existing)
        {
            if (keep.Contains((division.Category, division.Gender, division.WeightLimitKg))) continue;
            if (entries.Contains(division.Id)) continue;
            db.TournamentDivisions.Remove(division);
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Divisions an edit would remove that already have entries.</summary>
    private async Task<List<TournamentDivision>> DivisionsLostBy(
        Tournament tournament,
        Setup setup,
        CancellationToken cancellationToken)
    {
        var keep = TournamentEligibility
            .Plan(setup.Categories, setup.Genders, WeightClasses.For)
            .Select(w => (w.Category, w.Gender, w.Limit))
            .ToHashSet();

        var withEntries = await db.TournamentDivisions
            .Where(d => d.TournamentId == tournament.Id)
            .Where(d => db.TournamentEntries.Any(e => e.DivisionId == d.Id))
            .ToListAsync(cancellationToken);

        return withEntries
            .Where(d => !keep.Contains((d.Category, d.Gender, d.WeightLimitKg)))
            .ToList();
    }

    /* ── validation ─────────────────────────────────────────────────────── */

    private static Outcome Validate(Setup setup)
    {
        if (string.IsNullOrWhiteSpace(setup.NameAr) || string.IsNullOrWhiteSpace(setup.NameEn))
            return Outcome.Invalid("اسم البطولة مطلوب بالعربية والإنجليزية.", "The tournament needs a name in both languages.");

        if (setup.EndDate.Date < setup.StartDate.Date)
            return Outcome.Invalid("تاريخ النهاية قبل تاريخ البداية.", "The end date is before the start date.");

        if (setup.Categories.Count == 0)
            return Outcome.Invalid("يجب اختيار فئة واحدة على الأقل.", "At least one category must be chosen.");

        var unknownCategory = setup.Categories.FirstOrDefault(c => CompetitionCategories.All.All(e => e.Value != c));
        if (unknownCategory is not null)
            return Outcome.Invalid($"فئة غير معروفة: {unknownCategory}.", $"Unknown category: {unknownCategory}.");

        if (setup.Genders.Count == 0)
            return Outcome.Invalid("يجب اختيار الجنس.", "At least one gender must be chosen.");

        var unknownGender = setup.Genders.FirstOrDefault(g => g is not ("male" or "female"));
        if (unknownGender is not null)
            return Outcome.Invalid($"جنس غير معروف: {unknownGender}.", $"Unknown gender: {unknownGender}.");

        if (setup.RegistrationClosesAt is { } closes && closes > setup.StartDate.Date.AddDays(1))
            return Outcome.Invalid("لا يمكن أن يتجاوز إغلاق التسجيل بداية البطولة.", "Entries cannot close after the tournament starts.");

        return Outcome.Success();
    }

    public static IReadOnlyList<string> Split(string? csv) =>
        string.IsNullOrWhiteSpace(csv)
            ? []
            : csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
