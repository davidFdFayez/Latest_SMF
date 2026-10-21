using Smf.Api.Services;

namespace Smf.Api.Endpoints;

public static class PermissionFilter
{
    /// <summary>
    /// Refuses the request with 403 unless the caller holds at least one of
    /// <paramref name="anyOf"/> (see <see cref="Smf.Api.Data.AdminPermissions"/>).
    /// </summary>
    public static TBuilder RequirePermission<TBuilder>(this TBuilder builder, params string[] anyOf)
        where TBuilder : IEndpointConventionBuilder
    {
        builder.AddEndpointFilter(async (context, next) =>
        {
            var actor = AdminIdentity.Current(context.HttpContext.User);
            if (anyOf.Any(actor.Has)) return await next(context);

            return Forbidden(anyOf);
        });

        return builder;
    }

    /// <summary>403 in the bilingual shape the admin console displays.</summary>
    public static IResult Forbidden(params string[] required) => Results.Json(new
    {
        message = "لا تملك صلاحية تنفيذ هذا الإجراء. / You do not have permission for this action.",
        messageAr = "لا تملك صلاحية الوصول إلى هذا القسم.",
        messageEn = $"This requires the '{string.Join("' or '", required)}' permission.",
        requiredPermissions = required,
    }, statusCode: StatusCodes.Status403Forbidden);
}
