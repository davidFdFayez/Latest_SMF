using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Outcome = Smf.Api.Services.TournamentService.Outcome;

namespace Smf.Api.Services;

/// <summary>
/// The tournament-type and competition-type lists — Phase 3 REQ-01 rules 2
/// and 3, both of which let an authorised user add a new entry.
///
/// The values the signed document names are seeded and kept current on every
/// startup; anything the federation adds afterwards sits beside them and is
/// theirs to deactivate. Nothing is ever deleted, because a tournament already
/// created refers to it.
/// </summary>
public class TournamentLookups(SmfDbContext db, AuditLogger audit)
{
    /// <summary>Puts the document's own values in place, and refreshes their labels.</summary>
    public static async Task SeedAsync(SmfDbContext db, CancellationToken cancellationToken = default)
    {
        var seeds = TournamentTypes.Seed
            .Select((entry, index) => (LookupKinds.TournamentType, entry.Value, entry.Ar, entry.En, index))
            .Concat(TournamentCompetitionTypes.Seed
                .Select((entry, index) => (LookupKinds.CompetitionType, entry.Value, entry.Ar, entry.En, index)))
            .ToList();

        var existing = await db.TournamentLookups.ToListAsync(cancellationToken);
        var changed = false;

        foreach (var (kind, value, ar, en, order) in seeds)
        {
            var row = existing.FirstOrDefault(l => l.Kind == kind && l.Value == value);

            if (row is null)
            {
                db.TournamentLookups.Add(new TournamentLookup
                {
                    Kind = kind,
                    Value = value,
                    NameAr = ar,
                    NameEn = en,
                    SortOrder = order,
                    IsSeeded = true,
                });
                changed = true;
                continue;
            }

            // Keep the wording in step with the document without disturbing
            // anything the federation added or reordered.
            if (row.NameAr != ar || row.NameEn != en || !row.IsSeeded)
            {
                row.NameAr = ar;
                row.NameEn = en;
                row.IsSeeded = true;
                changed = true;
            }
        }

        if (changed) await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<List<TournamentLookup>> ListAsync(
        string kind,
        bool includeInactive = false,
        CancellationToken cancellationToken = default)
    {
        var query = db.TournamentLookups.AsNoTracking().Where(l => l.Kind == kind);
        if (!includeInactive) query = query.Where(l => l.IsActive);

        return await query.OrderBy(l => l.SortOrder).ThenBy(l => l.Id).ToListAsync(cancellationToken);
    }

    /// <summary>True when a value is one this list offers.</summary>
    public Task<bool> IsKnownAsync(string kind, string? value, CancellationToken cancellationToken = default) =>
        string.IsNullOrWhiteSpace(value)
            ? Task.FromResult(false)
            : db.TournamentLookups.AnyAsync(
                l => l.Kind == kind && l.Value == value && l.IsActive, cancellationToken);

    public async Task<(Outcome Result, TournamentLookup? Entry)> AddAsync(
        string kind,
        string nameAr,
        string nameEn,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (!LookupKinds.All.Contains(kind))
            return (Outcome.Invalid("قائمة غير معروفة.", "Unknown list."), null);

        if (string.IsNullOrWhiteSpace(nameAr) || string.IsNullOrWhiteSpace(nameEn))
            return (Outcome.Invalid("الاسم مطلوب بالعربية والإنجليزية.", "A name is needed in both languages."), null);

        var value = Slug(nameEn);
        if (value.Length == 0)
            return (Outcome.Invalid("الاسم الإنجليزي يجب أن يحتوي على أحرف.", "The English name needs letters in it."), null);

        if (await db.TournamentLookups.AnyAsync(l => l.Kind == kind && l.Value == value, cancellationToken))
            return (Outcome.Conflict("هذا الخيار موجود بالفعل.", "That option already exists."), null);

        var order = await db.TournamentLookups.CountAsync(l => l.Kind == kind, cancellationToken);

        var entry = new TournamentLookup
        {
            Kind = kind,
            Value = value,
            NameAr = nameAr.Trim(),
            NameEn = nameEn.Trim(),
            SortOrder = order,
            IsSeeded = false,
            CreatedBy = actor.Username,
        };

        db.TournamentLookups.Add(entry);
        audit.Write(actor, AuditActions.TournamentUpdated, "tournament_lookup", 0, value,
            details: $"Added to {kind}: {nameEn}.");

        await db.SaveChangesAsync(cancellationToken);
        return (Outcome.Success(), entry);
    }

    /// <summary>
    /// Takes an option out of use without deleting it. The document's own
    /// values stay: a tournament created as a Kingdom championship has to go
    /// on being one.
    /// </summary>
    public async Task<Outcome> SetActiveAsync(
        int id,
        bool isActive,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        var entry = await db.TournamentLookups.FirstOrDefaultAsync(l => l.Id == id, cancellationToken);
        if (entry is null) return Outcome.NotFound();

        if (entry.IsSeeded && !isActive)
        {
            return Outcome.Conflict(
                "لا يمكن إخفاء الخيارات الواردة في المستند المعتمد.",
                "The options named in the approved document cannot be hidden.");
        }

        entry.IsActive = isActive;
        audit.Write(actor, AuditActions.TournamentUpdated, "tournament_lookup", entry.Id, entry.Value,
            toStatus: isActive ? "active" : "inactive");

        await db.SaveChangesAsync(cancellationToken);
        return Outcome.Success();
    }

    /// <summary>A stable key from the English name: lower case, words joined by underscores.</summary>
    private static string Slug(string name)
    {
        var cleaned = new string(name.Trim().ToLowerInvariant()
            .Select(c => char.IsAsciiLetterOrDigit(c) ? c : ' ')
            .ToArray());

        var slug = string.Join('_', cleaned.Split(' ', StringSplitOptions.RemoveEmptyEntries));
        return slug.Length <= 60 ? slug : slug[..60];
    }
}
