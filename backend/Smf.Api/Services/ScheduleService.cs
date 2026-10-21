using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Outcome = Smf.Api.Services.TournamentService.Outcome;

namespace Smf.Api.Services;

/// <summary>
/// Rings, running order and start times — Phase 3 REQ-11.
///
/// <see cref="BoutScheduler"/> works out the times; this keeps the rings, the
/// per-division settings, and writes the result back. Regenerating is the
/// normal operation rather than an exceptional one: the document says the
/// schedule follows the draw (rule 8) and that editing a setting regenerates
/// the times it affects (rule 17), so every change ends with a rebuild.
/// </summary>
public class ScheduleService(SmfDbContext db, AuditLogger audit)
{
    /* ── rings (REQ-11 rule 5: "Add New Ring") ──────────────────────────── */

    public async Task<(Outcome Result, TournamentRing? Ring)> AddRingAsync(
        Tournament tournament,
        string name,
        TimeSpan? firstBoutTime,
        int? intervalMinutes,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        var clean = (name ?? string.Empty).Trim();
        if (clean.Length is 0 or > 60)
            return (Outcome.Invalid("اسم الحلبة مطلوب.", "A ring needs a name."), null);

        var taken = await db.TournamentRings
            .AnyAsync(r => r.TournamentId == tournament.Id && r.Name == clean, cancellationToken);

        if (taken)
            return (Outcome.Conflict("يوجد حلبة بهذا الاسم.", "A ring with that name already exists."), null);

        var order = await db.TournamentRings
            .Where(r => r.TournamentId == tournament.Id)
            .CountAsync(cancellationToken);

        var ring = new TournamentRing
        {
            TournamentId = tournament.Id,
            Name = clean,
            FirstBoutTime = firstBoutTime,
            BoutIntervalMinutes = intervalMinutes,
            SortOrder = order + 1,
        };

        db.TournamentRings.Add(ring);
        audit.Write(actor, AuditActions.ScheduleAmended, "tournament", tournament.Id,
            details: $"Ring added: {clean}.");
        await db.SaveChangesAsync(cancellationToken);

        return (Outcome.Success(), ring);
    }

    public async Task<Outcome> UpdateRingAsync(
        TournamentRing ring,
        string? name,
        TimeSpan? firstBoutTime,
        int? intervalMinutes,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(name)) ring.Name = name.Trim();
        if (firstBoutTime is not null) ring.FirstBoutTime = firstBoutTime;
        if (intervalMinutes is not null) ring.BoutIntervalMinutes = intervalMinutes;

        audit.Write(actor, AuditActions.ScheduleAmended, "tournament", ring.TournamentId,
            details: $"Ring {ring.Name} settings changed.");
        await db.SaveChangesAsync(cancellationToken);

        // Rule 17 — a changed setting regenerates the times it affects.
        return await GenerateAsync(ring.TournamentId, actor, cancellationToken);
    }

    public async Task<Outcome> RemoveRingAsync(
        TournamentRing ring,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        var inUse = await db.Bouts.AnyAsync(b => b.RingId == ring.Id, cancellationToken);
        if (inUse)
        {
            return Outcome.Conflict(
                "لا يمكن حذف حلبة عليها نزالات؛ انقلها أولًا.",
                "This ring has bouts on it; move them before removing it.");
        }

        db.TournamentRings.Remove(ring);
        audit.Write(actor, AuditActions.ScheduleAmended, "tournament", ring.TournamentId,
            details: $"Ring removed: {ring.Name}.");
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /* ── division settings (REQ-11 rule 5) ──────────────────────────────── */

    /// <summary>
    /// The three settings the document puts on a division: its ring, when its
    /// first bout starts, and the gap between bouts. Setting the ring here
    /// applies it to every bout in the division (rule 6), except any that were
    /// pinned to another ring by hand (rule 7).
    /// </summary>
    public async Task<Outcome> SetDivisionScheduleAsync(
        TournamentDivision division,
        int? ringId,
        DateTime? date,
        TimeSpan? firstBoutTime,
        int? intervalMinutes,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (division.DrawPublishedAt is null)
        {
            return Outcome.Conflict(
                "لا يمكن جدولة فئة لم تُعتمد قرعتها.",
                "A division cannot be scheduled until its draw is published.");
        }

        if (ringId is { } id)
        {
            var exists = await db.TournamentRings
                .AnyAsync(r => r.Id == id && r.TournamentId == division.TournamentId, cancellationToken);
            if (!exists) return Outcome.NotFound();
        }

        division.DefaultRingId = ringId ?? division.DefaultRingId;
        division.ScheduledDate = date ?? division.ScheduledDate;
        division.FirstBoutTime = firstBoutTime ?? division.FirstBoutTime;
        division.BoutIntervalMinutes = intervalMinutes ?? division.BoutIntervalMinutes;

        audit.Write(actor, AuditActions.ScheduleAmended, "tournament_division", division.Id,
            details: $"Ring {ringId?.ToString() ?? "unchanged"}, date {date?.ToString("yyyy-MM-dd") ?? "unchanged"}.");
        await db.SaveChangesAsync(cancellationToken);

        return await GenerateAsync(division.TournamentId, actor, cancellationToken);
    }

    /// <summary>
    /// REQ-11 rule 7 — moving one bout to another ring without disturbing the
    /// rest of its division. The choice is remembered, so regenerating leaves
    /// it where it was put.
    /// </summary>
    public async Task<Outcome> MoveBoutAsync(
        Bout bout,
        int? ringId,
        DateTime? date,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (ringId is { } id)
        {
            var exists = await db.TournamentRings
                .AnyAsync(r => r.Id == id && r.TournamentId == bout.TournamentId, cancellationToken);
            if (!exists) return Outcome.NotFound();

            bout.RingId = id;
            bout.RingPinned = true;
        }

        if (date is not null) bout.ScheduledDate = date.Value.Date;

        audit.Write(actor, AuditActions.ScheduleAmended, "bout", bout.Id,
            details: $"Moved to ring {ringId?.ToString() ?? "unchanged"}, {date?.ToString("yyyy-MM-dd") ?? "same day"}.");
        await db.SaveChangesAsync(cancellationToken);

        return await GenerateAsync(bout.TournamentId, actor, cancellationToken);
    }

    /* ── generation (REQ-11 rules 10 and 12) ────────────────────────────── */

    /// <summary>
    /// Rebuilds the whole tournament's running order.
    ///
    /// Whole-tournament rather than per-division because bout numbers run
    /// across rings and days (rule 12): changing one division's ring changes
    /// the numbering of everything after it.
    /// </summary>
    public async Task<Outcome> GenerateAsync(
        int tournamentId,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default,
        int boutsPerAthletePerDay = BoutScheduler.DefaultBoutsPerAthletePerDay)
    {
        var tournament = await db.Tournaments
            .FirstOrDefaultAsync(t => t.Id == tournamentId, cancellationToken);

        if (tournament is null) return Outcome.NotFound();

        var rings = await db.TournamentRings
            .Where(r => r.TournamentId == tournamentId)
            .OrderBy(r => r.SortOrder)
            .ToListAsync(cancellationToken);

        if (rings.Count == 0)
        {
            return Outcome.Conflict(
                "أضف حلبة واحدة على الأقل قبل توليد الجدول.",
                "Add at least one ring before generating the schedule.");
        }

        // Only divisions whose draw is published take part (rule 1).
        var divisions = await db.TournamentDivisions
            .Where(d => d.TournamentId == tournamentId && d.DrawPublishedAt != null)
            .ToListAsync(cancellationToken);

        var divisionIds = divisions.Select(d => d.Id).ToList();

        var bouts = await db.Bouts
            .Where(b => divisionIds.Contains(b.DivisionId))
            .ToListAsync(cancellationToken);

        // A bye is not fought and never takes a slot.
        var schedulable = bouts.Where(b => b.IsSchedulable).ToList();

        var entries = divisions.ToDictionary(d => d.Id);

        var input = schedulable.Select(b => new BoutScheduler.Entry(
            b.Id,
            b.DivisionId,
            entries[b.DivisionId].Category,
            entries[b.DivisionId].SortWeight,
            b.Round,
            b.Position,
            b.RedEntryId,
            b.BlueEntryId,
            b.ScheduledDate,
            b.RingId,
            b.RingPinned)).ToList();

        var ringSettings = rings.Select(r => new BoutScheduler.Ring(
            r.Id,
            r.Name,
            r.SortOrder,
            r.FirstBoutTime ?? tournament.FirstBoutTime,
            r.BoutIntervalMinutes ?? DefaultIntervalMinutes)).ToList();

        var divisionRing = divisions
            .Where(d => d.DefaultRingId is not null)
            .ToDictionary(d => d.Id, d => d.DefaultRingId!.Value);

        var divisionDate = divisions
            .Where(d => d.ScheduledDate is not null)
            .ToDictionary(d => d.Id, d => d.ScheduledDate!.Value.Date);

        var plan = BoutScheduler.Build(
            input, ringSettings, divisionRing, divisionDate, tournament.Days(), boutsPerAthletePerDay,
            TimingOf(divisions));

        var bySlot = plan.Slots.ToDictionary(s => s.BoutId);

        foreach (var bout in bouts)
        {
            if (bySlot.TryGetValue(bout.Id, out var slot))
            {
                bout.ScheduledDate = slot.Date;
                bout.RingId = slot.RingId;
                bout.OrderInRing = slot.OrderInRing;
                bout.StartTime = slot.StartTime;
                bout.BoutNumber = slot.BoutNumber;
            }
            else
            {
                // Byes and walkovers hold no slot.
                bout.OrderInRing = null;
                bout.StartTime = null;
                bout.BoutNumber = null;
            }
        }

        audit.Write(actor, AuditActions.ScheduleGenerated, "tournament", tournamentId,
            tournament.NameEn,
            details: $"{plan.Slots.Count} bout(s) across {rings.Count} ring(s)"
                     + (plan.Clashes.Count == 0 ? "." : $", {plan.Clashes.Count} clash(es) reported."));

        await db.SaveChangesAsync(cancellationToken);
        return Outcome.Success();
    }

    /// <summary>Half an hour, until a ring says otherwise.</summary>
    public const int DefaultIntervalMinutes = 30;

    /// <summary>
    /// The schedule as REQ-11 rule 2 asks it to read: grouped by category,
    /// divisions within it lightest first, bouts under each.
    /// </summary>
    /// <summary>
    /// What each division runs to where it has been given anything of its own
    /// (REQ-11 rule 17). Divisions with neither are left out, so the ring's
    /// own settings go on applying.
    /// </summary>
    private static Dictionary<int, BoutScheduler.DivisionTiming> TimingOf(
        IEnumerable<TournamentDivision> divisions) =>
        divisions
            .Where(d => d.FirstBoutTime is not null || d.BoutIntervalMinutes is not null)
            .ToDictionary(
                d => d.Id,
                d => new BoutScheduler.DivisionTiming(d.FirstBoutTime, d.BoutIntervalMinutes));

    public async Task<object> ViewAsync(int tournamentId, CancellationToken cancellationToken = default)
    {
        var tournament = await db.Tournaments.FirstAsync(t => t.Id == tournamentId, cancellationToken);

        var rings = await db.TournamentRings
            .Where(r => r.TournamentId == tournamentId)
            .OrderBy(r => r.SortOrder)
            .ToListAsync(cancellationToken);

        var divisions = await db.TournamentDivisions
            .Where(d => d.TournamentId == tournamentId && d.DrawPublishedAt != null)
            .ToListAsync(cancellationToken);

        var divisionIds = divisions.Select(d => d.Id).ToList();

        var bouts = await db.Bouts
            .Where(b => divisionIds.Contains(b.DivisionId))
            .ToListAsync(cancellationToken);

        var entryIds = bouts
            .SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId })
            .Where(id => id is not null).Select(id => id!.Value).Distinct().ToList();

        var entries = await db.TournamentEntries
            .Include(e => e.AthleteRegistration)
            .Where(e => entryIds.Contains(e.Id))
            .ToListAsync(cancellationToken);

        string? NameOf(int? entryId, bool arabic)
        {
            if (entryId is not { } id) return null;
            var entry = entries.FirstOrDefault(e => e.Id == id);
            if (entry?.AthleteRegistration is null) return null;
            var payload = System.Text.Json.JsonDocument.Parse(entry.AthleteRegistration.PayloadJson).RootElement;
            return RegistrationPayload.DisplayName(payload, arabic);
        }

        // Rebuild the clash list so the screen can show it without a write.
        var plan = BoutScheduler.Build(
            bouts.Where(b => b.IsSchedulable).Select(b => new BoutScheduler.Entry(
                b.Id, b.DivisionId,
                divisions.First(d => d.Id == b.DivisionId).Category,
                divisions.First(d => d.Id == b.DivisionId).SortWeight,
                b.Round, b.Position, b.RedEntryId, b.BlueEntryId,
                b.ScheduledDate, b.RingId, b.RingPinned)).ToList(),
            rings.Select(r => new BoutScheduler.Ring(
                r.Id, r.Name, r.SortOrder,
                r.FirstBoutTime ?? tournament.FirstBoutTime,
                r.BoutIntervalMinutes ?? DefaultIntervalMinutes)).ToList(),
            divisions.Where(d => d.DefaultRingId is not null).ToDictionary(d => d.Id, d => d.DefaultRingId!.Value),
            divisions.Where(d => d.ScheduledDate is not null).ToDictionary(d => d.Id, d => d.ScheduledDate!.Value.Date),
            tournament.Days(),
            divisionTiming: TimingOf(divisions));

        return new
        {
            tournament = new
            {
                tournament.Id,
                tournament.NameAr,
                tournament.NameEn,
                days = tournament.Days(),
                firstBoutTime = tournament.FirstBoutTime,
            },
            rings = rings.Select(r => new
            {
                r.Id,
                r.Name,
                r.SortOrder,
                firstBoutTime = r.FirstBoutTime ?? tournament.FirstBoutTime,
                intervalMinutes = r.BoutIntervalMinutes ?? DefaultIntervalMinutes,
            }),
            categories = divisions
                .GroupBy(d => d.Category)
                .OrderBy(g => g.Key, StringComparer.Ordinal)
                .Select(group => new
                {
                    category = group.Key,
                    categoryAr = CompetitionCategories.Label(group.Key).Ar,
                    categoryEn = CompetitionCategories.Label(group.Key).En,
                    divisions = group.OrderBy(d => d.SortWeight).Select(division => new
                    {
                        division.Id,
                        labelAr = division.Describe(arabic: true),
                        labelEn = division.Describe(arabic: false),
                        division.DefaultRingId,
                        division.ScheduledDate,
                        division.FirstBoutTime,
                        division.BoutIntervalMinutes,
                        bouts = bouts
                            .Where(b => b.DivisionId == division.Id && b.IsSchedulable)
                            .OrderBy(b => b.BoutNumber ?? int.MaxValue)
                            .Select(b => new
                            {
                                b.Id,
                                b.BoutNumber,
                                b.Round,
                                b.Position,
                                b.ScheduledDate,
                                b.RingId,
                                ringName = rings.FirstOrDefault(r => r.Id == b.RingId)?.Name,
                                b.StartTime,
                                b.RingPinned,
                                // Rule 3 — red on the left, blue on the right.
                                red = new { entryId = b.RedEntryId, nameAr = NameOf(b.RedEntryId, true), nameEn = NameOf(b.RedEntryId, false) },
                                blue = new { entryId = b.BlueEntryId, nameAr = NameOf(b.BlueEntryId, true), nameEn = NameOf(b.BlueEntryId, false) },
                            }),
                    }),
                }),
            clashes = plan.Clashes.Select(c => new { c.Kind, c.AthleteEntryId, c.MessageAr, c.MessageEn }),
        };
    }
}
