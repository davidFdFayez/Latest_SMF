using System.Data;
using Microsoft.EntityFrameworkCore;

namespace Smf.Api.Data;

/// <summary>
/// Reconciles an existing SQLite file with the current model.
///
/// The API creates its database with <c>EnsureCreated()</c>, which builds the
/// schema once and then never touches it again. Any column added to a model
/// afterwards is therefore missing on every database that already exists, and
/// the first insert fails with "table X has no column named Y" — which is
/// exactly what happened to the registration lifecycle columns.
///
/// This walks the model after <c>EnsureCreated()</c> and adds whatever is
/// absent: whole tables an existing database predates, then any missing
/// columns. It is additive and idempotent — it never drops, renames, or
/// retypes anything — so running it against an up-to-date database does
/// nothing at all.
///
/// Both halves matter. <c>EnsureCreated()</c> is a no-op the moment the file
/// exists, so it creates neither. A new entity therefore reached a
/// pre-existing database as a missing <em>table</em>, not a missing column,
/// and every write to it failed with "no such table" — which is what happened
/// to the audit log.
/// </summary>
public static class SqliteSchemaGuard
{
    public static void EnsureColumns(SmfDbContext db, ILogger? logger = null)
    {
        if (!db.Database.IsSqlite()) return;

        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) connection.Open();

        try
        {
            EnsureTables(db, connection, logger);

            foreach (var entityType in db.Model.GetEntityTypes())
            {
                var table = entityType.GetTableName();
                if (string.IsNullOrEmpty(table)) continue;

                var existing = ReadColumns(connection, table);
                // Still absent means it could not be created; the column pass
                // has nothing to work with.
                if (existing.Count == 0) continue;

                foreach (var property in entityType.GetProperties())
                {
                    var column = property.GetColumnName();
                    if (string.IsNullOrEmpty(column) || existing.Contains(column)) continue;

                    var definition = $"\"{column}\" {property.GetColumnType()}";
                    if (!property.IsNullable) definition += $" NOT NULL DEFAULT {DefaultLiteral(property.ClrType)}";

                    db.Database.ExecuteSqlRaw($"ALTER TABLE \"{table}\" ADD COLUMN {definition}");
                    logger?.LogInformation("Added missing column {Table}.{Column} to the SQLite schema.", table, column);
                }
            }
        }
        finally
        {
            if (openedHere) connection.Close();
        }
    }

    /// <summary>
    /// Creates tables the model defines but the database does not have.
    ///
    /// The DDL is EF's own — taken from <c>GenerateCreateScript</c> — so the
    /// column types, keys, and indexes match exactly what a freshly created
    /// database would get. Only the statements belonging to missing tables are
    /// executed; everything already present is left untouched.
    /// </summary>
    private static void EnsureTables(SmfDbContext db, System.Data.Common.DbConnection connection, ILogger? logger)
    {
        var missing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var entityType in db.Model.GetEntityTypes())
        {
            var table = entityType.GetTableName();
            if (string.IsNullOrEmpty(table)) continue;
            if (ReadColumns(connection, table).Count == 0) missing.Add(table);
        }

        if (missing.Count == 0) return;

        // SQLite DDL carries no internal semicolons, so splitting on them is safe.
        foreach (var statement in db.Database.GenerateCreateScript().Split(';'))
        {
            var sql = statement.Trim();
            if (sql.Length == 0) continue;

            var target = TargetTable(sql);
            if (target is null || !missing.Contains(target)) continue;

            db.Database.ExecuteSqlRaw(sql);
        }

        foreach (var table in missing)
        {
            var created = ReadColumns(connection, table).Count > 0;
            if (created) logger?.LogInformation("Created missing table {Table} in the SQLite schema.", table);
            else logger?.LogWarning("Table {Table} is in the model but could not be created.", table);
        }
    }

    /// <summary>
    /// The table a CREATE TABLE or CREATE INDEX statement belongs to, or null
    /// for anything else in the script.
    /// </summary>
    private static string? TargetTable(string sql)
    {
        var table = System.Text.RegularExpressions.Regex.Match(
            sql, @"^CREATE\s+TABLE\s+""([^""]+)""",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (table.Success) return table.Groups[1].Value;

        var index = System.Text.RegularExpressions.Regex.Match(
            sql, @"^CREATE\s+(?:UNIQUE\s+)?INDEX\s+""[^""]+""\s+ON\s+""([^""]+)""",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return index.Success ? index.Groups[1].Value : null;
    }

    private static HashSet<string> ReadColumns(System.Data.Common.DbConnection connection, string table)
    {
        var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        using var command = connection.CreateCommand();
        // Table names come from the EF model, never from user input.
        command.CommandText = $"PRAGMA table_info(\"{table}\")";

        using var reader = command.ExecuteReader();
        while (reader.Read()) columns.Add(reader.GetString(1));

        return columns;
    }

    /// <summary>
    /// SQLite requires a constant default when adding a NOT NULL column to a
    /// table that may already hold rows.
    /// </summary>
    private static string DefaultLiteral(Type clrType)
    {
        var type = Nullable.GetUnderlyingType(clrType) ?? clrType;

        if (type == typeof(string)) return "''";
        if (type == typeof(bool)) return "0";
        if (type == typeof(DateTime) || type == typeof(DateTimeOffset)) return "'0001-01-01 00:00:00'";
        if (type == typeof(Guid)) return "'00000000-0000-0000-0000-000000000000'";
        if (type.IsEnum || type.IsPrimitive || type == typeof(decimal)) return "0";

        return "''";
    }
}
