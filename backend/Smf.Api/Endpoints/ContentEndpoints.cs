using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// Website content: the public read side the site renders from, and the admin
/// side the console edits. Schema and defaults come from <see cref="ContentCatalog"/>.
/// </summary>
public static class ContentEndpoints
{
    /// <summary>Public, anonymous reads.</summary>
    public static void MapContentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/content").WithTags("Content");

        group.MapGet("/{key}", async (string key, HttpContext http, ContentCatalog catalog, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            var definition = catalog.Get(key);
            if (definition is null) return Results.NotFound();

            var entry = await db.ContentEntries.AsNoTracking().FirstOrDefaultAsync(e => e.Key == key, cancellationToken);

            // Edits must show on the next visit, so browsers revalidate.
            http.Response.Headers.CacheControl = "no-cache";
            return Results.Ok(new { key, updatedAt = entry?.UpdatedAt, content = Resolve(definition, entry) });
        });

        // Several keys in one request — the site layout needs "site" and
        // "navigation" on every page.
        group.MapGet("/", async (string? keys, HttpContext http, ContentCatalog catalog, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            var definitions = (keys ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.Ordinal)
                .Take(20)
                .Select(catalog.Get)
                .OfType<ContentCatalog.Definition>()
                .ToList();

            var names = definitions.Select(d => d.Key).ToList();
            var entries = await db.ContentEntries.AsNoTracking()
                .Where(e => names.Contains(e.Key))
                .ToDictionaryAsync(e => e.Key, cancellationToken);

            var result = new JsonObject();
            foreach (var definition in definitions)
                result[definition.Key] = Resolve(definition, entries.GetValueOrDefault(definition.Key));

            http.Response.Headers.CacheControl = "no-cache";
            return Results.Ok(result);
        });
    }

    /// <summary>Console editing. Viewing and saving a key both need that key's own permission.</summary>
    public static void MapContentAdmin(this RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/content")
            .RequirePermission(AdminPermissions.ContentPublish, AdminPermissions.Settings);

        group.MapGet("/", async (ClaimsPrincipal principal, ContentCatalog catalog, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(principal);
            var entries = await db.ContentEntries.AsNoTracking()
                .Select(e => new { e.Key, e.UpdatedAt, e.UpdatedBy })
                .ToDictionaryAsync(e => e.Key, cancellationToken);

            return Results.Ok(new
            {
                groups = ContentCatalog.Groups.Select(g => new { g.Key, g.NameAr, g.NameEn }),
                items = catalog.All.Select(d =>
                {
                    var entry = entries.GetValueOrDefault(d.Key);
                    return new
                    {
                        d.Key,
                        d.Group,
                        d.TitleEn,
                        d.TitleAr,
                        d.Route,
                        d.Permission,
                        customized = entry is not null,
                        updatedAt = entry?.UpdatedAt,
                        updatedBy = entry?.UpdatedBy,
                        canEdit = actor.Has(d.Permission),
                    };
                }),
            });
        });

        group.MapGet("/{key}", async (string key, ClaimsPrincipal principal, ContentCatalog catalog, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            var definition = catalog.Get(key);
            if (definition is null) return Results.NotFound();
            if (!AdminIdentity.Current(principal).Has(definition.Permission)) return PermissionFilter.Forbidden(definition.Permission);

            var entry = await db.ContentEntries.AsNoTracking().FirstOrDefaultAsync(e => e.Key == key, cancellationToken);
            return Results.Ok(Detail(definition, entry));
        });

        group.MapPut("/{key}", async (
            string key,
            ContentSaveRequest request,
            ClaimsPrincipal principal,
            ContentCatalog catalog,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            var definition = catalog.Get(key);
            if (definition is null) return Results.NotFound();

            var actor = AdminIdentity.Current(principal);
            if (!actor.Has(definition.Permission)) return PermissionFilter.Forbidden(definition.Permission);

            if (request.Content is not JsonObject submitted)
                return Error(400, "المحتوى مطلوب.", "The request must include the page content.");

            // Fields missing from the submission (the schema grew while the
            // editor was open) keep their defaults; everything present is taken
            // as written, including deliberately emptied text.
            var content = ContentCatalog.Normalize(definition.Fields, submitted, definition.Defaults);

            var problems = ContentCatalog.Validate(definition.Fields, content);
            if (problems.Count > 0)
            {
                var summary = string.Join("; ", problems.Take(5));
                return Results.Json(new
                {
                    message = $"المحتوى غير صالح. / {summary}",
                    messageAr = "المحتوى يحتوي على قيم غير صالحة.",
                    messageEn = summary,
                    errors = problems,
                }, statusCode: StatusCodes.Status400BadRequest);
            }

            var json = content.ToJsonString();
            if (json.Length > 2_000_000)
                return Error(400, "المحتوى كبير جداً.", "The content is too large to save.");

            var entry = await db.ContentEntries.FirstOrDefaultAsync(e => e.Key == key, cancellationToken);
            if (entry is null)
            {
                entry = new ContentEntry { Key = key };
                db.ContentEntries.Add(entry);
            }

            entry.ContentJson = json;
            entry.UpdatedAt = DateTime.UtcNow;
            entry.UpdatedBy = actor.Username;

            audit.Write(actor, AuditActions.ContentUpdated, "content", 0, key);
            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(Detail(definition, entry));
        });

        // Back to the built-in defaults.
        group.MapDelete("/{key}", async (
            string key,
            ClaimsPrincipal principal,
            ContentCatalog catalog,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            var definition = catalog.Get(key);
            if (definition is null) return Results.NotFound();

            var actor = AdminIdentity.Current(principal);
            if (!actor.Has(definition.Permission)) return PermissionFilter.Forbidden(definition.Permission);

            var entry = await db.ContentEntries.FirstOrDefaultAsync(e => e.Key == key, cancellationToken);
            if (entry is not null)
            {
                db.ContentEntries.Remove(entry);
                audit.Write(actor, AuditActions.ContentReset, "content", 0, key);
                await db.SaveChangesAsync(cancellationToken);
            }

            return Results.Ok(Detail(definition, null));
        });
    }

    /// <summary>Saved content over the defaults, so fields added to a schema later still render.</summary>
    private static JsonObject Resolve(ContentCatalog.Definition definition, ContentEntry? entry)
    {
        if (entry is null) return (JsonObject)definition.Defaults.DeepClone();

        JsonNode? stored = null;
        try
        {
            stored = JsonNode.Parse(entry.ContentJson);
        }
        catch (JsonException)
        {
            // A corrupt row falls back to the defaults rather than breaking the page.
        }

        return ContentCatalog.Normalize(definition.Fields, stored, definition.Defaults);
    }

    private static object Detail(ContentCatalog.Definition definition, ContentEntry? entry) => new
    {
        definition.Key,
        definition.Group,
        definition.TitleEn,
        definition.TitleAr,
        definition.Route,
        definition.Permission,
        schema = definition.Schema,
        content = Resolve(definition, entry),
        customized = entry is not null,
        updatedAt = entry?.UpdatedAt,
        updatedBy = entry?.UpdatedBy,
    };

    private static IResult Error(int status, string ar, string en) => Results.Json(new
    {
        message = $"{ar} / {en}",
        messageAr = ar,
        messageEn = en,
    }, statusCode: status);
}
