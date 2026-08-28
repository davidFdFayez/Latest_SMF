using System.Text;
using System.Text.Json;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// تصدير — renders the membership register as CSV (§6).
///
/// Columns are headed in both languages because the file is opened by the
/// federation's own staff, and the lifecycle dates are included because an
/// export whose rows cannot be aged is of little use for renewals.
/// </summary>
public static class RegistrationExport
{
    private static readonly (string Header, Func<Registration, JsonElement?, string?> Value)[] Columns =
    [
        ("رقم الطلب / Reference", (r, _) => r.ReferenceNumber),
        ("النوع / Type", (r, _) => r.Type),
        ("الاسم / Name", (_, p) => p is { } d ? RegistrationPayload.DisplayName(d, arabic: true)
                                                ?? RegistrationPayload.DisplayName(d, arabic: false) : null),
        ("البريد الإلكتروني / Email", (_, p) => p is { } d ? RegistrationPayload.FirstString(d, "email", "applicantEmail", "officialEmail") : null),
        ("الجوال / Mobile", (_, p) => p is { } d ? RegistrationPayload.FirstString(d, "phone", "mobile", "applicantPhone", "officialPhone") : null),
        ("المنطقة / Region", (_, p) => p is { } d ? RegistrationPayload.FirstString(d, "region") : null),
        ("المدينة / City", (_, p) => p is { } d ? RegistrationPayload.FirstString(d, "city") : null),
        ("الحالة / Status", (r, _) => RegistrationStatuses.Labels.TryGetValue(r.Status, out var l) ? $"{l.Ar} / {l.En}" : r.Status),
        ("المرحلة / Stage", (r, _) => $"{r.StageOrder}/{MembershipTracks.Get(r.Type)?.Stages.Count ?? 0}"),
        ("رقم العضوية / Membership no.", (r, _) => r.MembershipNumber),
        ("تاريخ التقديم / Submitted", (r, _) => Date(r.CreatedAt)),
        ("تاريخ الاعتماد / Approved", (r, _) => Date(r.ApprovedAt)),
        ("تاريخ الانتهاء / Expires", (r, _) => Date(r.ExpiresAt)),
        ("عدد التجديدات / Renewals", (r, _) => r.RenewalCount.ToString()),
        ("مهلة الاستكمال / Completion due", (r, _) => Date(r.CompletionDueAt)),
        ("السبب / Reason", (r, _) => r.StatusReason),
        ("آخر إجراء بواسطة / Last action by", (r, _) => r.LastActionBy),
    ];

    public static string ToCsv(IEnumerable<Registration> registrations)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(",", Columns.Select(c => Escape(c.Header))));

        foreach (var registration in registrations)
        {
            JsonElement? payload = null;
            try
            {
                payload = JsonDocument.Parse(registration.PayloadJson).RootElement;
            }
            catch (JsonException)
            {
                // A malformed payload costs that row its detail columns, not the
                // whole export.
            }

            builder.AppendLine(string.Join(",", Columns.Select(c => Escape(c.Value(registration, payload)))));
        }

        return builder.ToString();
    }

    private static string? Date(DateTime? value) => value?.ToString("yyyy-MM-dd");

    /// <summary>
    /// Quotes a CSV field. A leading =, +, -, or @ is prefixed with a single
    /// quote: spreadsheet software treats such a value as a formula, and these
    /// fields hold text typed by the public.
    /// </summary>
    private static string Escape(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "\"\"";

        var text = value;
        if (text[0] is '=' or '+' or '-' or '@') text = "'" + text;

        return "\"" + text.Replace("\"", "\"\"") + "\"";
    }
}
