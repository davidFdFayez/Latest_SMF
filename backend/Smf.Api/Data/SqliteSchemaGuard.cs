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
/// This walks the model after <c>EnsureCreated()</c> and issues
/// <c>ALTER TABLE … ADD COLUMN</c> for anything absent. It is additive and
/// idempotent: it never drops, renames, or retypes a column, so running it
/// against an up-to-date database does nothing at all.
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
            foreach (var entityType in db.Model.GetEntityTypes())
            {
                var table = entityType.GetTableName();
                if (string.IsNullOrEmpty(table)) continue;

                var existing = ReadColumns(connection, table);
                // No rows means the table itself is absent — EnsureCreated owns that case.
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
