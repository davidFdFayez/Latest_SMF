namespace Smf.Api.Services;

/// <summary>
/// TEMPORARY — the development-phase way into the public member portal, until
/// email delivery and the "set your password" message exist.
///
/// While it is switched on, the holder of an approved, live membership can
/// sign in with the email address they registered with and one shared
/// password, without an invitation. Their member account is created on first
/// sign-in, attached to that membership, exactly as an invitation would.
///
/// It is on only when both are true:
/// <list type="bullet">
/// <item>the API is running in Development, and</item>
/// <item><c>MemberAuth:DevelopmentPassword</c> is set (appsettings.Development.json).</item>
/// </list>
/// Removing that one setting — or running anywhere but Development — turns it
/// off everywhere at once: the sign-in path refuses it, and sessions it opened
/// stop validating, because no password was ever stored for them. It never
/// applies to console (admin) accounts, which sign in elsewhere.
///
/// To retire it: delete this file, the setting, and its two call sites in
/// <see cref="MemberAccountService.SignInAsync"/> and
/// <see cref="MemberIdentity.OnTokenValidatedAsync"/>.
/// </summary>
public static class DevelopmentMemberSignIn
{
    public const string SettingKey = "MemberAuth:DevelopmentPassword";

    /// <summary>Recorded as who created an account this way, so they can be found later.</summary>
    public const string CreatedBy = "development sign-in";

    public static bool IsEnabled(IConfiguration configuration, IHostEnvironment environment) =>
        environment.IsDevelopment() && !string.IsNullOrEmpty(configuration[SettingKey]);

    public static bool Matches(IConfiguration configuration, IHostEnvironment environment, string? password) =>
        IsEnabled(configuration, environment) && password == configuration[SettingKey];
}
