namespace Smf.Api.Services;

/// <summary>
/// The one rule for admin passwords, shared by the console's user screens and
/// the self-service reset, so the two can never drift apart.
/// </summary>
public static class PasswordPolicy
{
    public const int MinimumLength = 8;
    public const int MaximumLength = 128;

    public const string MessageAr = "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل وتحتوي على حرف ورقم.";
    public const string MessageEn = "Passwords must be at least 8 characters and contain a letter and a digit.";

    public static bool IsAcceptable(string? password) =>
        password is { Length: >= MinimumLength and <= MaximumLength }
        && password.Any(char.IsLetter)
        && password.Any(char.IsDigit);
}
