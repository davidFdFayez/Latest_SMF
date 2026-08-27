namespace Smf.Api.Data.Models;

public class Registration
{
    public int Id { get; set; }

    /// <summary>athlete | club | coach | official</summary>
    public string Type { get; set; } = "athlete";
    public string PayloadJson { get; set; } = "{}";
    public string ReferenceNumber { get; set; } = string.Empty;

    /// <summary>One of <see cref="RegistrationStatuses"/>.</summary>
    public string Status { get; set; } = RegistrationStatuses.New;

    /// <summary>
    /// Shown to the applicant when the request is rejected, and used as the
    /// list of missing items when more data or attachments are requested.
    /// </summary>
    public string? StatusReason { get; set; }

    /// <summary>Internal federation notes on the request or its documents.</summary>
    public string? InternalNotes { get; set; }

    /// <summary>Membership/accreditation number issued once approved.</summary>
    public string? MembershipNumber { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StatusChangedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }
}
