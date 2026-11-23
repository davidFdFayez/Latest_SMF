using System.Data;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// One email address, one registration identity — across athletes, coaches,
/// clubs and officials alike.
///
/// An address is reserved by:
///  - any member account with it (always);
///  - any registration that holds it — every status except Rejected and
///    Cancelled, which are terminal and release it (so applying again after a
///    rejection still works). Pending, approved, completed, suspended and
///    expired registrations all keep it.
///
/// A registration's addresses are every email it was made with (an athlete's,
/// coach's or official's <c>email</c>; a club's <c>applicantEmail</c> and
/// <c>officialEmail</c>), read from the stored form, so registrations made
/// before <see cref="Registration.NormalizedEmail"/> existed count exactly
/// like new ones. Addresses are compared trimmed and lower-cased.
///
/// Concurrency: the check and the insert it guards run inside one
/// <see cref="BeginExclusiveAsync"/> transaction. SQLite allows one writer at
/// a time and BEGIN IMMEDIATE takes that lock before the check, so no other
/// registration or account can be written between "it is free" and saving —
/// whatever records the check is against. The partial unique index on
/// <see cref="Registration.NormalizedEmail"/> is a second line of defence.
/// </summary>
public static class EmailReservations
{
    /// <summary>The form fields an email address can be entered in.</summary>
    public static readonly string[] EmailFields = ["email", "applicantEmail", "officialEmail"];

    /// <summary>Statuses that release a registration's address. Both are terminal.</summary>
    public static readonly string[] ReleasingStatuses = [RegistrationStatuses.Rejected, RegistrationStatuses.Cancelled];

    /// <summary>The partial unique index, as created on existing databases at start-up.</summary>
    public const string IndexName = "IX_Registrations_NormalizedEmail_Reserved";
    public const string IndexFilter = "\"NormalizedEmail\" IS NOT NULL AND \"Status\" NOT IN ('rejected', 'cancelled')";
    private const string CreateIndexSql =
        "CREATE UNIQUE INDEX IF NOT EXISTS \"" + IndexName + "\" ON \"Registrations\" (\"NormalizedEmail\") WHERE " + IndexFilter;

    public static string? Normalize(string? email)
    {
        var value = (email ?? string.Empty).Trim().ToLowerInvariant();
        return value.Length == 0 ? null : value;
    }

    /// <summary>Every address in a form, by the field it was entered in, normalized.</summary>
    public static IReadOnlyList<(string Field, string Email)> AddressesIn(JsonElement payload)
    {
        var found = new List<(string, string)>();
        if (payload.ValueKind != JsonValueKind.Object) return found;
        foreach (var field in EmailFields)
        {
            if (payload.TryGetProperty(field, out var value) && value.ValueKind == JsonValueKind.String
                && Normalize(value.GetString()) is { } email)
                found.Add((field, email));
        }
        return found;
    }

    /// <summary>The address a registration is known by: the person's, or a club's official one.</summary>
    public static string? PrimaryAddress(IReadOnlyList<(string Field, string Email)> addresses) =>
        addresses.FirstOrDefault(a => a.Field == "email").Email
        ?? addresses.FirstOrDefault(a => a.Field == "officialEmail").Email
        ?? addresses.FirstOrDefault().Email;

    /// <summary>
    /// Which of these addresses are already reserved. A registration or account
    /// named in <paramref name="exceptRegistrationIds"/> does not count against
    /// itself (an account being opened for its own registration).
    /// </summary>
    public static async Task<HashSet<string>> ReservedAsync(
        SmfDbContext db,
        IEnumerable<string> addresses,
        IReadOnlyCollection<int>? exceptRegistrationIds = null,
        CancellationToken cancellationToken = default)
    {
        var wanted = addresses.Select(Normalize).OfType<string>().Distinct().ToList();
        var taken = new HashSet<string>();
        if (wanted.Count == 0) return taken;
        var except = exceptRegistrationIds ?? [];

        // Member accounts: stored normalized, unique.
        foreach (var email in await db.MemberAccounts.AsNoTracking()
                     .Where(a => wanted.Contains(a.Email))
                     .Select(a => a.Email)
                     .ToListAsync(cancellationToken))
            taken.Add(email);

        // Registrations that hold their addresses — new ones by their column,
        // and every one (legacy included) by the addresses in its form. The
        // text match only narrows; each candidate is then read properly.
        foreach (var email in wanted)
        {
            if (taken.Contains(email)) continue;
            var candidates = await db.Registrations.AsNoTracking()
                .Where(r => !ReleasingStatuses.Contains(r.Status) && !except.Contains(r.Id))
                .Where(r => r.NormalizedEmail == email || EF.Functions.Like(r.PayloadJson, "%" + email + "%"))
                .Select(r => new { r.NormalizedEmail, r.PayloadJson })
                .ToListAsync(cancellationToken);
            if (candidates.Any(c => c.NormalizedEmail == email || AddressesOf(c.PayloadJson).Contains(email)))
                taken.Add(email);
        }

        return taken;
    }

    /// <summary>The addresses stored in a registration's form, normalized.</summary>
    public static HashSet<string> AddressesOf(string payloadJson)
    {
        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            return AddressesIn(document.RootElement).Select(a => a.Email).ToHashSet();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>
    /// A write transaction that holds SQLite's single write lock from the start
    /// (BEGIN IMMEDIATE), so a reservation check made inside it stays true until
    /// it commits. Other writers wait (the connection's busy timeout) rather
    /// than slipping in between.
    /// </summary>
    public static async Task<IDbContextTransaction> BeginExclusiveAsync(SmfDbContext db, CancellationToken cancellationToken)
    {
        await db.Database.OpenConnectionAsync(cancellationToken);
        var connection = (SqliteConnection)db.Database.GetDbConnection();
        var transaction = connection.BeginTransaction(IsolationLevel.Serializable, deferred: false);
        return await db.Database.UseTransactionAsync(transaction, cancellationToken)
            ?? throw new InvalidOperationException("Could not start the reservation transaction.");
    }

    /// <summary>True when a save failed on the reserved-address index.</summary>
    public static bool IsReservationConflict(DbUpdateException error) =>
        error.InnerException is SqliteException { SqliteErrorCode: 19 } sqlite
        && sqlite.Message.Contains("NormalizedEmail", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Creates the partial unique index on a database made before it existed.
    /// Only registrations made from now on carry the column, so existing
    /// records — including any that already share an address — never trip it.
    /// </summary>
    public static void EnsureIndex(SmfDbContext db, ILogger? logger = null)
    {
        db.Database.ExecuteSqlRaw(CreateIndexSql);
        logger?.LogDebug("Ensured {Index}.", IndexName);
    }
}
