using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Outcome = Smf.Api.Services.TournamentService.Outcome;

namespace Smf.Api.Services;

/// <summary>
/// Making, publishing and amending a draw — Phase 3 REQ-10.
///
/// <see cref="DrawBuilder"/> decides the shape; this writes it down, publishes
/// it, and handles what happens afterwards. The two are kept apart because the
/// shape is the part worth testing exhaustively and it should not need a
/// database to do it.
///
/// Rule 6 is the one that shapes this class: the technical delegate may redraw
/// or amend a published draw without anybody else's approval, but a reason is
/// compulsory and every change is logged. So there is no "edit" that bypasses
/// the audit trail.
/// </summary>
public class DrawService(SmfDbContext db, AuditLogger audit)
{
    /// <summary>
    /// Draws a division from its qualified athletes.
    /// </summary>
    /// <param name="seed">
    /// Supplied so a draw can be reproduced in a dispute. Omitted means a new
    /// random one, which is recorded in the audit entry.
    /// </param>
    public async Task<(Outcome Result, int Bouts)> CreateAsync(
        TournamentDivision division,
        AdminIdentity.Actor actor,
        int? seed,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var existing = await db.Bouts
            .Where(b => b.DivisionId == division.Id)
            .ToListAsync(cancellationToken);

        if (existing.Count > 0 && division.DrawPublishedAt is not null && string.IsNullOrWhiteSpace(reason))
        {
            return (Outcome.Invalid(
                "إعادة القرعة بعد النشر تتطلب ذكر السبب.",
                "Redrawing a published draw requires a reason."), 0);
        }

        // REQ-10 rule 1 — the qualified pool, and nobody else.
        var qualified = await db.TournamentEntries
            .Include(e => e.AthleteRegistration)
            .Where(e => e.DivisionId == division.Id)
            .Where(e => e.Status == EntryStatuses.Qualified)
            .ToListAsync(cancellationToken);

        var pool = qualified
            .Where(e => e.IsQualified)
            .Select(e => new DrawBuilder.Contender(e.Id, e.ClubName))
            .ToList();

        if (pool.Count < 2)
        {
            return (Outcome.Conflict(
                "لا توجد أعداد كافية من اللاعبين المؤهلين لإنشاء قرعة.",
                "There are not enough qualified athletes to make a draw."), 0);
        }

        var chosenSeed = seed ?? Random.Shared.Next();
        var draw = DrawBuilder.Build(pool, chosenSeed);

        // A redraw replaces what was there. Bouts are owned by the division, so
        // nothing outside it is affected.
        db.Bouts.RemoveRange(existing);
        await db.SaveChangesAsync(cancellationToken);

        var created = new Dictionary<(int Round, int Position), Bout>();

        foreach (var planned in draw.Bouts.OrderBy(b => b.Round).ThenBy(b => b.Position))
        {
            var bout = new Bout
            {
                TournamentId = division.TournamentId,
                DivisionId = division.Id,
                Round = planned.Round,
                Position = planned.Position,
                RedEntryId = planned.RedEntryId,
                BlueEntryId = planned.BlueEntryId,
                IsBye = planned.IsBye,
            };

            db.Bouts.Add(bout);
            created[(planned.Round, planned.Position)] = bout;
        }

        await db.SaveChangesAsync(cancellationToken);

        // Now that every bout has an id, point each at the one above it.
        foreach (var planned in draw.Bouts)
        {
            if (planned.WinnerToPosition is not { } nextPosition) continue;
            if (!created.TryGetValue((planned.Round, planned.Position), out var bout)) continue;
            if (!created.TryGetValue((planned.Round + 1, nextPosition), out var next)) continue;

            bout.WinnerToBoutId = next.Id;
            bout.WinnerToCorner = planned.WinnerToCorner;
        }

        division.DrawPublishedAt = null;

        audit.Write(actor,
            existing.Count > 0 ? AuditActions.DrawAmended : AuditActions.DrawCreated,
            "tournament_division", division.Id,
            division.Describe(arabic: false),
            details: $"{pool.Count} athletes, {draw.ByeCount} bye(s), seed {chosenSeed}."
                     + (reason is null ? string.Empty : $" Reason: {reason}"));

        await db.SaveChangesAsync(cancellationToken);
        return (Outcome.Success(), draw.Bouts.Count);
    }

    /// <summary>Publishing is what lets the schedule see the division (REQ-11 rule 1).</summary>
    public async Task<Outcome> PublishAsync(
        TournamentDivision division,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        var bouts = await db.Bouts.CountAsync(b => b.DivisionId == division.Id, cancellationToken);
        if (bouts == 0)
        {
            return Outcome.Conflict(
                "لا توجد قرعة لنشرها.",
                "There is no draw to publish.");
        }

        division.DrawPublishedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.DrawPublished, "tournament_division", division.Id,
            division.Describe(arabic: false));
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// REQ-10 rule 6 — moving an athlete within a published draw, or taking
    /// one out. The reason is compulsory and the change is logged; the
    /// delegate needs nobody else's approval.
    /// </summary>
    public async Task<Outcome> AmendCornerAsync(
        Bout bout,
        string corner,
        int? entryId,
        string reason,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            return Outcome.Invalid(
                "تعديل القرعة يتطلب ذكر السبب.",
                "Amending a draw requires a reason.");
        }

        if (corner is not ("red" or "blue"))
            return Outcome.Invalid("ركن غير معروف.", "Unknown corner.");

        if (entryId is { } id)
        {
            var entry = await db.TournamentEntries
                .FirstOrDefaultAsync(e => e.Id == id && e.DivisionId == bout.DivisionId, cancellationToken);

            if (entry is null)
            {
                return Outcome.Conflict(
                    "هذا اللاعب ليس ضمن هذه الفئة.",
                    "That athlete is not in this division.");
            }

            // The same athlete cannot occupy both corners.
            var other = corner == "red" ? bout.BlueEntryId : bout.RedEntryId;
            if (other == id)
            {
                return Outcome.Invalid(
                    "لا يمكن أن يواجه اللاعب نفسه.",
                    "An athlete cannot face themselves.");
            }
        }

        var before = corner == "red" ? bout.RedEntryId : bout.BlueEntryId;
        if (corner == "red") bout.RedEntryId = entryId; else bout.BlueEntryId = entryId;

        // A bout with one corner empty is a bye; filling it makes it a contest.
        bout.IsBye = bout.RedEntryId is null ^ bout.BlueEntryId is null;

        audit.Write(actor, AuditActions.DrawAmended, "bout", bout.Id,
            details: $"{corner}: {before?.ToString() ?? "empty"} -> {entryId?.ToString() ?? "empty"}. Reason: {reason}");

        await db.SaveChangesAsync(cancellationToken);
        return Outcome.Success();
    }

    /// <summary>
    /// REQ-10 rules 7 and 8 — a withdrawal. Before the draw the athlete simply
    /// leaves the division. Afterwards their opponent advances as a walkover,
    /// because the bracket has already been published and cannot quietly
    /// reshape itself.
    /// </summary>
    public async Task<Outcome> ApplyWithdrawalAsync(
        TournamentEntry entry,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        var bouts = await db.Bouts
            .Where(b => b.DivisionId == entry.DivisionId)
            .Where(b => b.RedEntryId == entry.Id || b.BlueEntryId == entry.Id)
            .ToListAsync(cancellationToken);

        if (bouts.Count == 0)
        {
            // Not drawn yet: nothing to unpick.
            entry.DivisionId = null;
            await db.SaveChangesAsync(cancellationToken);
            return Outcome.Success();
        }

        foreach (var bout in bouts)
        {
            var opponent = bout.RedEntryId == entry.Id ? bout.BlueEntryId : bout.RedEntryId;

            if (bout.RedEntryId == entry.Id) bout.RedEntryId = null;
            else bout.BlueEntryId = null;

            if (opponent is not null)
            {
                bout.IsWalkover = true;
                bout.IsBye = true;
                bout.WinnerEntryId = opponent;

                // Walk the opponent into the next round, as a bye would.
                if (bout.WinnerToBoutId is { } nextId)
                {
                    var next = await db.Bouts.FirstOrDefaultAsync(b => b.Id == nextId, cancellationToken);
                    if (next is not null)
                    {
                        if (bout.WinnerToCorner == "red") next.RedEntryId = opponent;
                        else next.BlueEntryId = opponent;
                    }
                }
            }

            audit.Write(actor, AuditActions.DrawAmended, "bout", bout.Id,
                details: opponent is null
                    ? $"Entry {entry.Id} withdrew; no opponent to advance."
                    : $"Entry {entry.Id} withdrew; entry {opponent} advances as a walkover.");
        }

        await db.SaveChangesAsync(cancellationToken);
        return Outcome.Success();
    }

    /// <summary>The division's bracket, shaped for display.</summary>
    public async Task<object> BracketAsync(TournamentDivision division, CancellationToken cancellationToken = default)
    {
        var bouts = await db.Bouts
            .Where(b => b.DivisionId == division.Id)
            .OrderBy(b => b.Round).ThenBy(b => b.Position)
            .ToListAsync(cancellationToken);

        var totalRounds = bouts.Count == 0 ? 0 : bouts.Max(b => b.Round);
        /* "Preliminary" describes a first round the *draw* left partly empty
           (REQ-10 rule 5). A walkover from a later withdrawal also empties a
           corner, but the round was full when it was drawn and its name should
           not change afterwards. */
        var firstRoundPartial = bouts.Any(b => b.Round == 1 && b.IsBye && !b.IsWalkover);

        var entryIds = bouts
            .SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId })
            .Where(id => id is not null).Select(id => id!.Value).Distinct().ToList();

        var entries = await db.TournamentEntries
            .Include(e => e.AthleteRegistration)
            .Where(e => entryIds.Contains(e.Id))
            .ToListAsync(cancellationToken);

        var names = entries.ToDictionary(
            e => e.Id,
            e => new
            {
                e.Id,
                nameAr = e.AthleteRegistration is null
                    ? null
                    : RegistrationPayload.DisplayName(
                        System.Text.Json.JsonDocument.Parse(e.AthleteRegistration.PayloadJson).RootElement, true),
                nameEn = e.AthleteRegistration is null
                    ? null
                    : RegistrationPayload.DisplayName(
                        System.Text.Json.JsonDocument.Parse(e.AthleteRegistration.PayloadJson).RootElement, false),
                club = e.ClubName,
                e.Status,
            });

        return new
        {
            division = new
            {
                division.Id,
                division.Category,
                division.Gender,
                division.WeightLimitKg,
                labelAr = division.Describe(arabic: true),
                labelEn = division.Describe(arabic: false),
                division.DrawPublishedAt,
            },
            totalRounds,
            rounds = Enumerable.Range(1, totalRounds).Select(round => new
            {
                round,
                nameAr = BoutRounds.Name(round, totalRounds, round == 1 && firstRoundPartial).Ar,
                nameEn = BoutRounds.Name(round, totalRounds, round == 1 && firstRoundPartial).En,
                bouts = bouts.Where(b => b.Round == round).Select(b => new
                {
                    b.Id,
                    b.Position,
                    b.IsBye,
                    b.IsWalkover,
                    b.BoutNumber,
                    b.ScheduledDate,
                    b.StartTime,
                    b.RingId,
                    red = b.RedEntryId is { } r && names.TryGetValue(r, out var redEntry) ? redEntry : null,
                    blue = b.BlueEntryId is { } l && names.TryGetValue(l, out var blueEntry) ? blueEntry : null,
                }),
            }),
        };
    }
}
