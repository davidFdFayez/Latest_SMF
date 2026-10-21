using System.Security.Claims;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

public static class MediaEndpoints
{
    /// <summary>Public reads of uploaded media.</summary>
    public static void MapMediaEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/media/{name}", (string name, HttpContext http, MediaStore store) =>
        {
            if (!store.TryResolve(name, out var path, out var contentType)) return Results.NotFound();

            // Names are random and never reused, so the bytes behind a URL never change.
            http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";

            // The API's blanket "default-src 'none'" policy is right for JSON but
            // stops browsers rendering a PDF opened in its own tab.
            if (contentType == "application/pdf")
                http.Response.Headers.Remove("Content-Security-Policy");

            return Results.File(path, contentType, enableRangeProcessing: true);
        }).WithTags("Media");
    }

    /// <summary>Uploads from the console — anyone who edits something that shows an image or document.</summary>
    public static void MapMediaAdmin(this RouteGroupBuilder admin)
    {
        admin.MapPost("/media", async (
            IFormFile? file,
            ClaimsPrincipal principal,
            MediaStore store,
            AuditLogger audit,
            SmfDbContext db,
            CancellationToken cancellationToken) =>
        {
            if (file is null)
                return Results.Json(new
                {
                    message = "لم يتم إرفاق ملف. / No file was attached.",
                    messageAr = "لم يتم إرفاق ملف.",
                    messageEn = "No file was attached.",
                }, statusCode: StatusCodes.Status400BadRequest);

            var result = await store.SaveAsync(file, cancellationToken);
            if (result.Media is null)
                return Results.Json(new
                {
                    message = $"{result.ErrorAr} / {result.ErrorEn}",
                    messageAr = result.ErrorAr,
                    messageEn = result.ErrorEn,
                }, statusCode: StatusCodes.Status400BadRequest);

            audit.Write(AdminIdentity.Current(principal), AuditActions.MediaUploaded, "media", 0,
                result.Media.Name, details: result.Media.FileName);
            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(result.Media);
        })
        .RequirePermission(AdminPermissions.ContentPublish, AdminPermissions.Settings, AdminPermissions.News, AdminPermissions.Events)
        // Bearer-token auth with no cookies, so there is no cross-site form to forge.
        .DisableAntiforgery();
    }
}
