using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// The one club identity used to keep club-mates apart in a draw and shown on
/// the bracket and participant lists (DRW-007): the club, trimmed; otherwise
/// the training centre, trimmed; otherwise none. <see cref="DrawBuilder"/>
/// compares it case-insensitively. Reads the entry only — no registration or
/// club record is changed.
/// </summary>
public static class DrawClub
{
    public static string? Of(TournamentEntry e) =>
        !string.IsNullOrWhiteSpace(e.ClubName) ? e.ClubName.Trim()
        : !string.IsNullOrWhiteSpace(e.TrainingCentre) ? e.TrainingCentre.Trim()
        : null;
}
