using Microsoft.EntityFrameworkCore;
using Smf.Api.Data.Models;

namespace Smf.Api.Data;

public class SmfDbContext(DbContextOptions<SmfDbContext> options) : DbContext(options)
{
    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<NewsArticle> NewsArticles => Set<NewsArticle>();
    public DbSet<EventItem> Events => Set<EventItem>();
    public DbSet<ResultRecord> Results => Set<ResultRecord>();
    public DbSet<ContentEntry> ContentEntries => Set<ContentEntry>();
    public DbSet<NotificationLog> NotificationLog => Set<NotificationLog>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<Registration> Registrations => Set<Registration>();
    public DbSet<ContactMessage> ContactMessages => Set<ContactMessage>();
    public DbSet<WhistleblowerReport> WhistleblowerReports => Set<WhistleblowerReport>();
    public DbSet<SiteSetting> SiteSettings => Set<SiteSetting>();
    public DbSet<AuditLogEntry> AuditLog => Set<AuditLogEntry>();
    public DbSet<AdminRole> Roles => Set<AdminRole>();
    public DbSet<AdminRolePermission> RolePermissions => Set<AdminRolePermission>();
    public DbSet<AdminUserRole> UserRoles => Set<AdminUserRole>();

    // ── Phase 3: tournaments ────────────────────────────────────────────
    public DbSet<Tournament> Tournaments => Set<Tournament>();
    public DbSet<TournamentDivision> TournamentDivisions => Set<TournamentDivision>();
    public DbSet<TournamentEntry> TournamentEntries => Set<TournamentEntry>();
    public DbSet<TournamentRing> TournamentRings => Set<TournamentRing>();
    public DbSet<Bout> Bouts => Set<Bout>();
    public DbSet<TournamentLookup> TournamentLookups => Set<TournamentLookup>();
    public DbSet<AthleteMedicalFile> AthleteMedicalFiles => Set<AthleteMedicalFile>();
    public DbSet<MedicalSuspension> MedicalSuspensions => Set<MedicalSuspension>();
    public DbSet<MemberAccount> MemberAccounts => Set<MemberAccount>();
    public DbSet<MemberProfileChange> MemberProfileChanges => Set<MemberProfileChange>();


    /// <summary>
    /// Phase 3 relationships.
    ///
    /// Deletes are deliberately restricted almost everywhere: a tournament with
    /// a draw in it holds the record of who fought whom, and that should not
    /// disappear because somebody removed a row above it. The exceptions are
    /// the structures a tournament owns outright — its divisions and rings.
    /// </summary>
    private static void ConfigureTournaments(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TournamentLookup>(entity =>
        {
            entity.HasIndex(l => new { l.Kind, l.Value }).IsUnique();
        });

        modelBuilder.Entity<TournamentDivision>(entity =>
        {
            entity.HasOne(d => d.Tournament)
                .WithMany(t => t.Divisions)
                .HasForeignKey(d => d.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);

            // One division per category, gender and weight class.
            entity.HasIndex(d => new { d.TournamentId, d.Category, d.Gender, d.WeightLimitKg }).IsUnique();

            entity.Property(d => d.WeightLimitKg).HasPrecision(6, 2);
            entity.Property(d => d.WeightFloorKg).HasPrecision(6, 2);
        });

        modelBuilder.Entity<TournamentRing>(entity =>
        {
            entity.HasOne(r => r.Tournament)
                .WithMany(t => t.Rings)
                .HasForeignKey(r => r.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(r => new { r.TournamentId, r.Name }).IsUnique();
        });

        modelBuilder.Entity<TournamentEntry>(entity =>
        {
            entity.HasOne(e => e.Tournament)
                .WithMany()
                .HasForeignKey(e => e.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Division)
                .WithMany(d => d.Entries)
                .HasForeignKey(e => e.DivisionId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.AthleteRegistration)
                .WithMany()
                .HasForeignKey(e => e.AthleteRegistrationId)
                .OnDelete(DeleteBehavior.Restrict);

            // REQ-03 rule 12 — one entry per athlete per tournament. The
            // database enforces it so a double submit cannot slip through
            // between the check and the insert.
            entity.HasIndex(e => new { e.TournamentId, e.AthleteRegistrationId }).IsUnique();

            entity.Property(e => e.DeclaredWeightKg).HasPrecision(6, 2);
            entity.Property(e => e.ActualWeightKg).HasPrecision(6, 2);
            entity.Property(e => e.HeightCm).HasPrecision(5, 1);
        });

        modelBuilder.Entity<MemberAccount>(entity =>
        {
            entity.HasOne(a => a.Registration)
                .WithMany()
                .HasForeignKey(a => a.RegistrationId)
                .OnDelete(DeleteBehavior.Cascade);

            // One account per address, across clubs, coaches and athletes
            // alike: it is the sign-in name.
            entity.HasIndex(a => a.Email).IsUnique();
            entity.HasIndex(a => a.ClubRegistrationId);
        });

        modelBuilder.Entity<MemberProfileChange>(entity =>
        {
            entity.HasOne(c => c.MemberAccount)
                .WithMany()
                .HasForeignKey(c => c.MemberAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(c => new { c.Status, c.CreatedAt });
        });

        modelBuilder.Entity<AthleteMedicalFile>(entity =>
        {
            entity.HasOne(f => f.AthleteRegistration)
                .WithMany()
                .HasForeignKey(f => f.AthleteRegistrationId)
                .OnDelete(DeleteBehavior.Cascade);

            // One file per athlete: it follows them between tournaments.
            entity.HasIndex(f => f.AthleteRegistrationId).IsUnique();
        });

        modelBuilder.Entity<MedicalSuspension>(entity =>
        {
            entity.HasOne(s => s.AthleteRegistration)
                .WithMany()
                .HasForeignKey(s => s.AthleteRegistrationId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(s => new { s.AthleteRegistrationId, s.EndsOn });
        });

        modelBuilder.Entity<Bout>(entity =>
        {
            entity.HasOne(b => b.Tournament)
                .WithMany()
                .HasForeignKey(b => b.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(b => b.Division)
                .WithMany(d => d.Bouts)
                .HasForeignKey(b => b.DivisionId)
                .OnDelete(DeleteBehavior.Cascade);

            // A corner points at an entry without owning it: removing an
            // athlete from a draw is an edit to the bout, never a delete.
            entity.HasOne(b => b.RedEntry)
                .WithMany()
                .HasForeignKey(b => b.RedEntryId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(b => b.BlueEntry)
                .WithMany()
                .HasForeignKey(b => b.BlueEntryId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(b => b.Ring)
                .WithMany(r => r.Bouts)
                .HasForeignKey(b => b.RingId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(b => new { b.DivisionId, b.Round, b.Position }).IsUnique();
            entity.HasIndex(b => new { b.TournamentId, b.BoutNumber });
        });
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        ConfigureTournaments(modelBuilder);

        modelBuilder.Entity<AdminUser>()
            .HasIndex(u => u.Username)
            .IsUnique();

        modelBuilder.Entity<AdminRole>()
            .HasIndex(r => r.Key)
            .IsUnique();

        modelBuilder.Entity<AdminRolePermission>(entity =>
        {
            entity.HasKey(p => new { p.AdminRoleId, p.Permission });
            entity.HasOne(p => p.Role)
                .WithMany(r => r.Permissions)
                .HasForeignKey(p => p.AdminRoleId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AdminUserRole>(entity =>
        {
            entity.HasKey(ur => new { ur.AdminUserId, ur.AdminRoleId });
            entity.HasOne(ur => ur.User)
                .WithMany(u => u.Roles)
                .HasForeignKey(ur => ur.AdminUserId)
                .OnDelete(DeleteBehavior.Cascade);
            // A role still held by someone is refused at the endpoint; Restrict
            // backs that up so a stray delete can never silently strip access.
            entity.HasOne(ur => ur.Role)
                .WithMany(r => r.Users)
                .HasForeignKey(ur => ur.AdminRoleId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ContentEntry>()
            .HasIndex(c => c.Key)
            .IsUnique();

        // Read as "everything sent about this request", and as a recent feed.
        modelBuilder.Entity<NotificationLog>()
            .HasIndex(n => n.RegistrationId);

        modelBuilder.Entity<NotificationLog>()
            .HasIndex(n => n.CreatedAt);

        modelBuilder.Entity<PasswordResetToken>(entity =>
        {
            entity.HasIndex(t => t.TokenHash).IsUnique();
            entity.HasOne(t => t.User)
                .WithMany()
                .HasForeignKey(t => t.AdminUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SiteSetting>()
            .HasIndex(s => s.Key)
            .IsUnique();

        modelBuilder.Entity<Registration>()
            .HasIndex(r => r.ReferenceNumber)
            .IsUnique();

        modelBuilder.Entity<WhistleblowerReport>()
            .HasIndex(r => r.ReferenceNumber)
            .IsUnique();

        // The audit trail is read as "everything that happened to this record",
        // and as a reverse-chronological feed, so both are indexed.
        modelBuilder.Entity<AuditLogEntry>()
            .HasIndex(e => new { e.EntityType, e.EntityId });

        modelBuilder.Entity<AuditLogEntry>()
            .HasIndex(e => e.CreatedAt);

        // Membership expiry is swept on a schedule, so it is queried by date.
        modelBuilder.Entity<Registration>()
            .HasIndex(r => r.ExpiresAt);
    }
}
