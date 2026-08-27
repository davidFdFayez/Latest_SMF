using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Smf.Api.Data;

namespace Smf.Api.Services;

/// <summary>
/// Server-side validation for the registration portal (SEC-01).
///
/// Everything the wizard enforces in the browser is re-checked here, because a
/// direct POST bypasses the form entirely. The rules mirror
/// web/src/pages/Registration.jsx and web/src/data/registrationPortal.js — if
/// one side changes, the other has to change with it.
///
/// Errors come back keyed by the field name the portal uses, so the wizard can
/// show them next to the offending input instead of as one opaque banner.
/// </summary>
public static class RegistrationValidator
{
    public sealed record Failure(string Ar, string En);

    public sealed record Result(Dictionary<string, Failure> Errors)
    {
        public bool IsValid => Errors.Count == 0;
    }

    /* ── shared primitives ───────────────────────────────────────────────── */

    private static readonly Regex EmailPattern = new(@"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", RegexOptions.Compiled);
    private static readonly Regex E164Pattern = new(@"^\+[1-9]\d{7,14}$", RegexOptions.Compiled);
    private static readonly Regex IsoDatePattern = new(@"^\d{4}-\d{2}-\d{2}$", RegexOptions.Compiled);
    private static readonly Regex UrlPattern = new(@"^https?://\S+$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    // Arabic block, Arabic Supplement, Extended-A — matching the portal's range.
    // Regex-level escapes rather than literal characters, so the rule survives
    // any re-encoding of this file.
    private const string ArabicRange = @"\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF";

    private static readonly Regex ArabicOnlyPattern =
        new($@"^[{ArabicRange}\s'’\-.()/]+$", RegexOptions.Compiled);
    private static readonly Regex HasArabicPattern =
        new($"[{ArabicRange}]", RegexOptions.Compiled);
    private static readonly Regex LatinOnlyPattern = new(@"^[A-Za-z\s'’\-.()/]+$", RegexOptions.Compiled);
    private static readonly Regex HasLatinPattern = new(@"[A-Za-z]", RegexOptions.Compiled);
    private static readonly Regex HasDigitPattern = new(@"\d", RegexOptions.Compiled);

    private static readonly string[] Genders = ["male", "female"];
    private static readonly string[] DocumentTypes = ["national_id", "iqama", "passport", "gcc_id"];
    private static readonly string[] YesNo = ["yes", "no"];
    private static readonly string[] AthleteCategories = ["junior", "youth", "senior", "elite", "para"];
    private static readonly string[] RefereeGrades = ["entry", "third", "second", "first", "international"];
    private static readonly string[] ApplicantRoles = ["owner", "coach", "authorized"];
    private static readonly string[] EntityTypes = ["club", "center", "academy"];
    private static readonly string[] GuardianRelations = ["father", "mother", "legal_guardian", "other"];

    /// <summary>Eligible age window per category — REG-05.</summary>
    private static readonly Dictionary<string, (int Min, int Max)> AgeLimits = new()
    {
        ["athlete"] = (6, 45),
        ["coach"] = (18, 80),
        ["official"] = (18, 80),
    };

    /* ── entry point ─────────────────────────────────────────────────────── */

    public static Result Validate(string type, JsonElement payload)
    {
        var errors = new Dictionary<string, Failure>(StringComparer.Ordinal);

        if (payload.ValueKind != JsonValueKind.Object)
        {
            errors["payload"] = new Failure(
                "بيانات الطلب غير صالحة.",
                "The request payload is not a valid object.");
            return new Result(errors);
        }

        var form = new Form(payload, errors);

        if (type == "club") ValidateClub(form);
        else ValidatePerson(form, type);

        return new Result(errors);
    }

    /* ── athlete / coach / referee ───────────────────────────────────────── */

    private static void ValidatePerson(Form form, string type)
    {
        ValidateNameParts(form, string.Empty);

        form.OneOf("documentType", DocumentTypes);
        form.NationalId("nationalId");
        form.DateOfBirth("dateOfBirth", AgeLimits[type]);
        form.Nationality("nationality");
        form.OneOf("gender", Genders);

        form.Phone("phone");
        form.Email("email");
        form.Required("region");
        form.Required("city");

        if (type == "athlete") ValidateAthlete(form);
        if (type == "official") ValidateReferee(form);
        if (type == "coach") form.OptionalUrl("cvUrl");
    }

    private static void ValidateAthlete(Form form)
    {
        var para = form.OneOf("paraAthlete", YesNo);
        if (para == "yes") form.Required("paraClassification");

        // REG-11 — the plausible weight range follows the age band, exactly as
        // the portal computes it.
        var age = AgeOf(form.Text("dateOfBirth"));
        var (min, max) = age switch
        {
            null => (20m, 150m),
            <= 13 => (20m, 80m),
            <= 17 => (28m, 110m),
            _ => (40m, 150m),
        };
        form.Decimal("currentWeight", min, max, required: true);

        form.OneOf("athleteCategory", AthleteCategories);
        form.OptionalUrl("cvUrl");

        // §10 — an athlete under 18 must supply a guardian.
        if (age is not null && age < 18)
        {
            form.Required("guardianName");
            form.Phone("guardianPhone");
            form.OneOf("guardianRelation", GuardianRelations);
        }
    }

    private static void ValidateReferee(Form form)
    {
        form.OneOf("refereeGrade", RefereeGrades);
        form.IsoDate("refereeStartDate", required: true);
        form.Integer("yearsExperience", 0, 70, required: true);

        var tournaments = form.Integer("tournamentsCount", 0, 2000, required: true);
        if (tournaments is > 0)
        {
            form.Required("lastTournament");
            form.IsoDate("lastRefereeingDate", required: true);
        }
    }

    /* ── club / facility ─────────────────────────────────────────────────── */

    private static void ValidateClub(Form form)
    {
        ValidateNameParts(form, string.Empty);

        form.OneOf("applicantRole", ApplicantRoles);
        form.NationalId("applicantId");
        form.Nationality("nationality");

        form.Phone("applicantPhone");
        form.Email("applicantEmail");
        form.Email("officialEmail");
        form.Required("region");
        form.Required("city");
        form.Required("district");

        form.ArabicText("nameAr");
        form.LatinText("nameEn");
        form.OneOf("entityType", EntityTypes);
        form.Required("ownerName");
        form.Required("headCoachName");
        form.Phone("headCoachPhone");

        form.OptionalEmail("ownerEmail");
        form.OptionalEmail("headCoachEmail");
        form.OptionalPhone("ownerPhone");
        form.OptionalUrl("googleMapsUrl");
        form.OptionalUrl("clubWebsite");

        if (form.Text("hasBranches") == "yes") form.Integer("branchCount", 1, 500, required: true);
    }

    /* ── names (REG-03 / REG-04) ─────────────────────────────────────────── */

    private static void ValidateNameParts(Form form, string prefix)
    {
        foreach (var part in new[] { "firstName", "fatherName", "familyName" })
        {
            form.ArabicName($"{prefix}{part}Ar");
            form.LatinName($"{prefix}{part}En");
        }
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private static int? AgeOf(string? isoDate)
    {
        if (string.IsNullOrWhiteSpace(isoDate)) return null;
        if (!DateTime.TryParseExact(isoDate, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var birth))
            return null;

        var today = DateTime.UtcNow.Date;
        var age = today.Year - birth.Year;
        if (birth.Date > today.AddYears(-age)) age--;
        return age;
    }

    /// <summary>
    /// Thin reader over the submitted JSON that records a bilingual failure
    /// against the field name rather than throwing, so one bad request reports
    /// every problem at once instead of only the first.
    /// </summary>
    private sealed class Form(JsonElement payload, Dictionary<string, Failure> errors)
    {
        public string? Text(string name)
        {
            if (!payload.TryGetProperty(name, out var value)) return null;

            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString()?.Trim(),
                JsonValueKind.Number => value.ToString(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => null,
            };
        }

        private void Fail(string name, string ar, string en) => errors.TryAdd(name, new Failure(ar, en));

        private bool Missing(string name, string? value, bool required)
        {
            if (!string.IsNullOrWhiteSpace(value)) return false;
            if (required) Fail(name, "هذا الحقل مطلوب.", "This field is required.");
            return true;
        }

        public string? Required(string name)
        {
            var value = Text(name);
            return Missing(name, value, true) ? null : value;
        }

        public void ArabicName(string name)
        {
            var value = Required(name);
            if (value is null) return;

            if (value.Length < 2 || !HasArabicPattern.IsMatch(value) || HasLatinPattern.IsMatch(value)
                || HasDigitPattern.IsMatch(value) || !ArabicOnlyPattern.IsMatch(value))
            {
                Fail(name,
                    "يرجى الكتابة بالأحرف العربية فقط (حرفان على الأقل، بدون أرقام).",
                    "Please use Arabic letters only (at least two characters, no digits).");
            }
        }

        public void LatinName(string name)
        {
            var value = Required(name);
            if (value is null) return;

            if (value.Length < 2 || !HasLatinPattern.IsMatch(value) || HasArabicPattern.IsMatch(value)
                || HasDigitPattern.IsMatch(value) || !LatinOnlyPattern.IsMatch(value))
            {
                Fail(name,
                    "يرجى الكتابة بالأحرف اللاتينية فقط (حرفان على الأقل، بدون أرقام).",
                    "Please use Latin letters only (at least two characters, no digits).");
            }
        }

        public void ArabicText(string name)
        {
            var value = Required(name);
            if (value is null) return;
            if (value.Length < 2 || !HasArabicPattern.IsMatch(value) || HasLatinPattern.IsMatch(value))
                Fail(name, "يرجى الكتابة بالأحرف العربية.", "Please write this in Arabic script.");
        }

        public void LatinText(string name)
        {
            var value = Required(name);
            if (value is null) return;
            if (value.Length < 2 || !HasLatinPattern.IsMatch(value) || HasArabicPattern.IsMatch(value))
                Fail(name, "يرجى الكتابة بالأحرف اللاتينية.", "Please write this in Latin script.");
        }

        public string? OneOf(string name, string[] allowed)
        {
            var value = Required(name);
            if (value is null) return null;

            if (!allowed.Contains(value, StringComparer.OrdinalIgnoreCase))
            {
                Fail(name, "القيمة المحددة غير صالحة.", "The selected value is not one of the accepted options.");
                return null;
            }
            return value.ToLowerInvariant();
        }

        public void Email(string name)
        {
            var value = Required(name);
            if (value is null) return;
            if (value.Length > 254 || !EmailPattern.IsMatch(value))
                Fail(name, "يرجى إدخال بريد إلكتروني صحيح.", "Please enter a valid email address.");
        }

        public void OptionalEmail(string name)
        {
            var value = Text(name);
            if (string.IsNullOrWhiteSpace(value)) return;
            if (value.Length > 254 || !EmailPattern.IsMatch(value))
                Fail(name, "يرجى إدخال بريد إلكتروني صحيح.", "Please enter a valid email address.");
        }

        public void Phone(string name) => CheckPhone(name, Required(name));

        public void OptionalPhone(string name)
        {
            var value = Text(name);
            if (!string.IsNullOrWhiteSpace(value)) CheckPhone(name, value);
        }

        private void CheckPhone(string name, string? value)
        {
            if (value is null) return;

            var compact = value.Replace(" ", "").Replace("-", "").Replace("(", "").Replace(")", "");
            if (!E164Pattern.IsMatch(compact) || !IsoCountries.HasKnownCallingCode(compact))
            {
                Fail(name,
                    "يرجى إدخال رقم جوال دولي صحيح مع مفتاح الدولة، مثال: +966512345678.",
                    "Please enter a valid international number including the country code, e.g. +966512345678.");
            }
        }

        public void Nationality(string name)
        {
            var value = Required(name);
            if (value is null) return;
            if (!IsoCountries.IsAlpha2(value))
            {
                Fail(name,
                    "الجنسية يجب أن تكون رمز دولة وفق معيار ISO 3166-1.",
                    "Nationality must be an ISO 3166-1 alpha-2 country code.");
            }
        }

        public void NationalId(string name)
        {
            var value = Required(name);
            if (value is null) return;

            var compact = value.Replace(" ", "");
            var digitsOnly = compact.All(char.IsAsciiDigit);
            var valid = digitsOnly
                ? compact.Length == 10
                : compact.Length is >= 5 and <= 15 && compact.All(char.IsAsciiLetterOrDigit);

            if (!valid)
            {
                Fail(name,
                    "رقم الهوية يتكون من 10 أرقام، أو أدخل رقم جواز صحيح.",
                    "An ID number is 10 digits, or enter a valid passport number.");
            }
        }

        public void IsoDate(string name, bool required)
        {
            var value = required ? Required(name) : Text(name);
            if (string.IsNullOrWhiteSpace(value)) return;

            if (!IsoDatePattern.IsMatch(value)
                || !DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                        DateTimeStyles.None, out var parsed)
                || parsed.Date > DateTime.UtcNow.Date)
            {
                Fail(name,
                    "يرجى إدخال تاريخ صحيح بصيغة YYYY-MM-DD وغير مستقبلي.",
                    "Please enter a valid, non-future date in YYYY-MM-DD format.");
            }
        }

        public void DateOfBirth(string name, (int Min, int Max) limits)
        {
            var value = Required(name);
            if (value is null) return;

            IsoDate(name, required: true);
            if (errors.ContainsKey(name)) return;

            var age = AgeOf(value);
            if (age is null || age < limits.Min || age > limits.Max)
            {
                Fail(name,
                    $"العمر المقبول لهذا التسجيل من {limits.Min} إلى {limits.Max} سنة.",
                    $"The eligible age for this registration is {limits.Min} to {limits.Max}.");
            }
        }

        public void Decimal(string name, decimal min, decimal max, bool required)
        {
            var value = required ? Required(name) : Text(name);
            if (string.IsNullOrWhiteSpace(value)) return;

            if (!decimal.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                || parsed < min || parsed > max)
            {
                Fail(name,
                    $"يرجى إدخال قيمة بين {min:0.##} و{max:0.##}.",
                    $"Please enter a value between {min:0.##} and {max:0.##}.");
            }
        }

        public int? Integer(string name, int min, int max, bool required)
        {
            var value = required ? Required(name) : Text(name);
            if (string.IsNullOrWhiteSpace(value)) return null;

            if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
                || parsed < min || parsed > max)
            {
                Fail(name,
                    $"يرجى إدخال رقم صحيح بين {min} و{max}.",
                    $"Please enter a whole number between {min} and {max}.");
                return null;
            }
            return parsed;
        }

        public void OptionalUrl(string name)
        {
            var value = Text(name);
            if (string.IsNullOrWhiteSpace(value)) return;
            if (!UrlPattern.IsMatch(value))
                Fail(name, "يرجى إدخال رابط يبدأ بـ https://", "Please enter a link starting with https://");
        }
    }
}
