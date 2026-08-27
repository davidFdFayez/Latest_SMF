namespace Smf.Api.Data.Models;

public class SiteSetting
{
    public int Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string ValueAr { get; set; } = string.Empty;
    public string ValueEn { get; set; } = string.Empty;
}
