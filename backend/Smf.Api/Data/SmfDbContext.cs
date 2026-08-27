using Microsoft.EntityFrameworkCore;
using Smf.Api.Data.Models;

namespace Smf.Api.Data;

public class SmfDbContext(DbContextOptions<SmfDbContext> options) : DbContext(options)
{
    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<NewsArticle> NewsArticles => Set<NewsArticle>();
    public DbSet<EventItem> Events => Set<EventItem>();
    public DbSet<ResultRecord> Results => Set<ResultRecord>();
    public DbSet<PageContent> Pages => Set<PageContent>();
    public DbSet<Registration> Registrations => Set<Registration>();
    public DbSet<ContactMessage> ContactMessages => Set<ContactMessage>();
    public DbSet<WhistleblowerReport> WhistleblowerReports => Set<WhistleblowerReport>();
    public DbSet<SiteSetting> SiteSettings => Set<SiteSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<AdminUser>()
            .HasIndex(u => u.Username)
            .IsUnique();

        modelBuilder.Entity<PageContent>()
            .HasIndex(p => p.Slug)
            .IsUnique();

        modelBuilder.Entity<SiteSetting>()
            .HasIndex(s => s.Key)
            .IsUnique();

        modelBuilder.Entity<Registration>()
            .HasIndex(r => r.ReferenceNumber)
            .IsUnique();

        modelBuilder.Entity<WhistleblowerReport>()
            .HasIndex(r => r.ReferenceNumber)
            .IsUnique();
    }
}
