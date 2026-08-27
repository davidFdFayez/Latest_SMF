namespace Smf.Api.Data.Models;

public class WhistleblowerReport
{
    public int Id { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? OptionalContact { get; set; }
    public string ReferenceNumber { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsReviewed { get; set; } = false;
}
