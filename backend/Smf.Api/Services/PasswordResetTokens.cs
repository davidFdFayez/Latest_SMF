using System.Security.Cryptography;
using System.Text;

namespace Smf.Api.Services;

/// <summary>
/// Reset-link tokens.
///
/// The token travels in the email; only its SHA-256 hash is stored, so the
/// database never holds anything that can be used to take over an account.
/// Lookup is by hash, and comparison is a plain equality check on that hash
/// rather than on the secret itself.
/// </summary>
public static class PasswordResetTokens
{
    /// <summary>256 bits of randomness, URL-safe so it survives being put in a link.</summary>
    public static string Create() => Base64Url(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
