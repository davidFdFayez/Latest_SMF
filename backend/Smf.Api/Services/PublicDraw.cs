using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// The public shape of a division's draw — what the Website's Draw tab shows.
///
/// Only what a spectator needs: round names, each bout's corners with the
/// athlete's display name and club, BYE / walkover markers and, once results
/// exist, which corner won. Nothing internal is exposed: no bout, entry or
/// registration ids, no bout numbers, rings or times (the Match Schedule is a
/// separate, later section), no dates of birth, weights or contact details,
/// and no image URLs or ids. A photo is announced only for an athlete whose membership is
/// approved and whose athlete account is active (PublicPhotos) — as an opaque version key; the image is then fetched
/// by its slot (round, position, corner). Bouts are addressed by round and position; the bracket's links
/// follow from them (position p feeds position ⌈p/2⌉ of the next round,
/// red when p is odd), exactly as DrawBuilder links them.
/// </summary>
public static class PublicDraw
{
    public static async Task<object> ProjectAsync(SmfDbContext db, TournamentDivision division, RegistrationAttachmentStore store,
        CancellationToken cancellationToken = default)
    {
        var bouts = await db.Bouts.AsNoTracking()
            .Where(b => b.DivisionId == division.Id)
            .OrderBy(b => b.Round).ThenBy(b => b.Position)
            .ToListAsync(cancellationToken);

        var ids = bouts.SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId, b.WinnerEntryId }).OfType<int>().Distinct().ToList();
        var entries = await db.TournamentEntries.AsNoTracking()
            .Include(e => e.AthleteRegistration)
            .Where(e => ids.Contains(e.Id))
            .ToDictionaryAsync(e => e.Id, cancellationToken);
        var registrationIds = entries.Values.Select(e => e.AthleteRegistrationId).Distinct().ToList();
        var accounts = await db.MemberAccounts.AsNoTracking()
            .Where(m => registrationIds.Contains(m.RegistrationId) && m.Kind == MemberAccountKinds.Athlete)
            .ToListAsync(cancellationToken);
        var now = DateTime.UtcNow;

        object? Athlete(int? id)
        {
            if (id is not { } entryId || !entries.TryGetValue(entryId, out var e)) return null;
            string? Name(bool arabic)
            {
                if (e.AthleteRegistration is null) return null;
                using var payload = System.Text.Json.JsonDocument.Parse(e.AthleteRegistration.PayloadJson);
                return RegistrationPayload.DisplayName(payload.RootElement, arabic);
            }
            var photo = PublicPhotos.Authorized(e.AthleteRegistration, accounts, store, now, out var photoId) ? PublicPhotos.Key(photoId!) : null;
            // nationality: ISO alpha-2 from the registration (the same field and rule as the public Match Schedule).
            return new { nameAr = Name(true), nameEn = Name(false), club = DrawClub.Of(e), photo, nationality = ScheduleService.NationalityOf(e) };
        }

        var totalRounds = bouts.Count == 0 ? 0 : bouts.Max(b => b.Round);
        var partial = bouts.Any(b => b.Round == 1 && b.IsBye && !b.IsWalkover);
        var roundOne = bouts.Where(b => b.Round == 1).ToList();
        var (categoryAr, categoryEn) = CompetitionCategories.Label(division.Category);

        return new
        {
            division = new
            {
                id = division.Id,
                genderAr = division.Gender == "female" ? "إناث" : "ذكور",
                genderEn = division.Gender == "female" ? "Female" : "Male",
                categoryAr,
                categoryEn,
                weightAr = division.WeightLabel(arabic: true),
                weightEn = division.WeightLabel(arabic: false),
            },
            athletes = roundOne.SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId }).OfType<int>().Distinct().Count(),
            byes = roundOne.Count(b => b.IsBye && !b.IsWalkover),
            totalRounds,
            rounds = Enumerable.Range(1, totalRounds).Select(round => new
            {
                round,
                nameAr = BoutRounds.Name(round, totalRounds, round == 1 && partial).Ar,
                nameEn = BoutRounds.Name(round, totalRounds, round == 1 && partial).En,
                bouts = bouts.Where(b => b.Round == round).Select(b => new
                {
                    position = b.Position,
                    isBye = b.IsBye && !b.IsWalkover,
                    isWalkover = b.IsWalkover,
                    winner = b.WinnerEntryId is { } w ? (w == b.RedEntryId ? "red" : w == b.BlueEntryId ? "blue" : null) : null,
                    red = Athlete(b.RedEntryId),
                    blue = Athlete(b.BlueEntryId),
                }),
            }),
        };
    }

    /// <summary>
    /// A stored public snapshot (the version kept on the website while an updated draw is a Draft) with each NAMED
    /// athlete's nationality added at read time, as the live projection has it. A corner is matched to its entry by
    /// the snapshot's slot map, and only when that athlete's names still equal the published ones; the stored
    /// snapshot itself is never changed. Snapshots that already carry nationality are left as they are.
    /// </summary>
    public static async Task<string> WithNationalityAsync(SmfDbContext db, string snapshotJson, string slotsJson,
        CancellationToken cancellationToken = default)
    {
        var root = System.Text.Json.Nodes.JsonNode.Parse(snapshotJson);
        Dictionary<string, int>? slots = null;
        try { slots = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, int>>(slotsJson); } catch (System.Text.Json.JsonException) { }
        if (root?["rounds"] is not System.Text.Json.Nodes.JsonArray rounds || slots is null || slots.Count == 0) return snapshotJson;
        var entries = await db.TournamentEntries.AsNoTracking().Include(e => e.AthleteRegistration)
            .Where(e => slots.Values.Contains(e.Id)).ToDictionaryAsync(e => e.Id, cancellationToken);
        var changed = false;
        foreach (var round in rounds)
        foreach (var bout in round?["bouts"]?.AsArray() ?? [])
        foreach (var corner in new[] { "red", "blue" })
        {
            if (bout?[corner] is not System.Text.Json.Nodes.JsonObject athlete || athlete.ContainsKey("nationality")) continue;
            if (!slots.TryGetValue($"{round!["round"]}:{bout["position"]}:{corner}", out var id) || !entries.TryGetValue(id, out var e)) continue;
            if ((string?)athlete["nameEn"] != DrawService.DisplayName(e, false) || (string?)athlete["nameAr"] != DrawService.DisplayName(e, true)) continue;
            if (ScheduleService.NationalityOf(e) is not { } nationality) continue;
            athlete["nationality"] = nationality;
            changed = true;
        }
        return changed ? root.ToJsonString(new System.Text.Json.JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) : snapshotJson;
    }

    /// <summary>
    /// The image file of the athlete in a bracket slot, when (and only when) that athlete authorized public
    /// display. Null for an empty slot, an unknown slot, or any photo that is not authorized.
    /// </summary>
    public static async Task<(string Path, string ContentType)?> SlotPhotoAsync(SmfDbContext db, RegistrationAttachmentStore store,
        int divisionId, int round, int position, string corner, CancellationToken cancellationToken = default)
    {
        if (corner is not ("red" or "blue")) return null;
        var bout = await db.Bouts.AsNoTracking().FirstOrDefaultAsync(b => b.DivisionId == divisionId && b.Round == round && b.Position == position, cancellationToken);
        var entryId = corner == "red" ? bout?.RedEntryId : bout?.BlueEntryId;
        return entryId is { } id ? await EntryPhotoAsync(db, store, id, cancellationToken) : null;
    }

    /// <summary>
    /// The image file of one tournament entry's athlete, when (and only when) PublicPhotos authorizes it —
    /// checked now, on every request. Shared by the public bracket and the public Match Schedule.
    /// </summary>
    public static async Task<(string Path, string ContentType)?> EntryPhotoAsync(SmfDbContext db, RegistrationAttachmentStore store,
        int entryId, CancellationToken cancellationToken = default)
    {
        var registration = await db.TournamentEntries.AsNoTracking().Where(e => e.Id == entryId)
            .Select(e => e.AthleteRegistration).FirstOrDefaultAsync(cancellationToken);
        var accounts = registration is null ? [] : await db.MemberAccounts.AsNoTracking()
            .Where(m => m.RegistrationId == registration.Id && m.Kind == MemberAccountKinds.Athlete)
            .ToListAsync(cancellationToken);
        if (!PublicPhotos.Authorized(registration, accounts, store, DateTime.UtcNow, out var photoId)
            || !store.TryResolve(photoId, out var path, out var meta)) return null;
        return (path, meta.ContentType);
    }
}
