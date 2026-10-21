using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Smf.Api.Data;

/// <summary>
/// The editable content of the public website.
///
/// Each page (or site-wide block such as contact details) is described by one
/// JSON file in <c>Data/Content/</c>, embedded in the assembly:
///
/// <code>
/// {
///   "key": "organization-values", "group": "federation", "order": 30,
///   "titleEn": "Values", "titleAr": "القيم", "route": "/organization/values",
///   "permission": "content.publish",            // optional
///   "schema":  [ { "name": "hero", "type": "group", "label": "…", "fields": [ … ] } ],
///   "content": { "hero": { … } }                 // the defaults
/// }
/// </code>
///
/// Field types: <c>text</c> and <c>textarea</c> hold <c>{ "ar": "", "en": "" }</c>;
/// <c>string</c>, <c>url</c>, <c>image</c>, <c>file</c> and <c>select</c> hold one
/// string; <c>boolean</c> holds true/false; <c>group</c> holds an object and
/// <c>list</c> an array of objects, both described by nested <c>fields</c>.
///
/// The schema lives in code rather than the database because each field only
/// exists because a page renders it. What the database holds is the content,
/// and only once someone edits it — until then the defaults, which are the
/// site's approved text, are served.
/// </summary>
public sealed class ContentCatalog
{
    private const string ResourcePrefix = "content/";
    private const int MaxListItems = 500;

    public record Group(string Key, string NameAr, string NameEn);

    public static readonly IReadOnlyList<Group> Groups =
    [
        new("site", "إعدادات الموقع العامة", "Site-wide"),
        new("home", "الصفحة الرئيسية", "Home page"),
        new("federation", "الاتحاد", "Federation"),
        new("governance", "الحوكمة", "Governance"),
        new("about", "عن المواي تاي", "About Muaythai"),
        new("participation", "المشاركة والخدمات", "Participation & services"),
    ];

    public sealed record Field(string Name, string Type, IReadOnlyList<Field> Fields, IReadOnlyList<string> Options);

    public sealed class Definition
    {
        public required string Key { get; init; }
        public required string Group { get; init; }
        public int Order { get; init; }
        public required string TitleEn { get; init; }
        public required string TitleAr { get; init; }
        public string? Route { get; init; }
        public required string Permission { get; init; }

        /// <summary>The schema as authored, sent to the admin editor verbatim.</summary>
        public required JsonArray Schema { get; init; }

        public required IReadOnlyList<Field> Fields { get; init; }

        /// <summary>Default content, already normalised against <see cref="Fields"/>.</summary>
        public required JsonObject Defaults { get; init; }
    }

    private static readonly HashSet<string> KnownTypes =
        ["text", "textarea", "string", "url", "image", "file", "select", "boolean", "group", "list"];

    private readonly Dictionary<string, Definition> _definitions = new(StringComparer.Ordinal);

    public ContentCatalog() : this(typeof(ContentCatalog).Assembly)
    {
    }

    /// <summary>
    /// Loads and checks every embedded definition. A malformed one throws, so a
    /// mistake in a content file stops the API at startup instead of shipping a
    /// page that silently loses text.
    /// </summary>
    public ContentCatalog(Assembly assembly)
    {
        var resources = assembly.GetManifestResourceNames()
            .Where(n => n.StartsWith(ResourcePrefix, StringComparison.Ordinal))
            .Order(StringComparer.Ordinal);

        foreach (var resource in resources)
        {
            using var stream = assembly.GetManifestResourceStream(resource)
                ?? throw new InvalidOperationException($"Content definition {resource} could not be read.");

            var definition = Parse(resource, stream);
            if (!_definitions.TryAdd(definition.Key, definition))
                throw new InvalidOperationException($"Content key '{definition.Key}' is declared twice ({resource}).");
        }
    }

    public IEnumerable<Definition> All => _definitions.Values
        .OrderBy(d => Groups.ToList().FindIndex(g => g.Key == d.Group))
        .ThenBy(d => d.Order)
        .ThenBy(d => d.Key, StringComparer.Ordinal);

    public Definition? Get(string? key) => key is null ? null : _definitions.GetValueOrDefault(key);

    private static Definition Parse(string resource, Stream stream)
    {
        JsonObject root;
        try
        {
            root = JsonNode.Parse(stream, documentOptions: new JsonDocumentOptions
            {
                AllowTrailingCommas = true,
                CommentHandling = JsonCommentHandling.Skip,
            }) as JsonObject ?? throw new InvalidOperationException($"Content definition {resource} must be a JSON object.");
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"Content definition {resource} is not valid JSON: {ex.Message}", ex);
        }

        string Required(string property) =>
            Str(root[property]) is { Length: > 0 } value
                ? value
                : throw new InvalidOperationException($"Content definition {resource} is missing \"{property}\".");

        var key = Required("key");
        if (!System.Text.RegularExpressions.Regex.IsMatch(key, "^[a-z0-9]+(-[a-z0-9]+)*$"))
            throw new InvalidOperationException($"Content key '{key}' ({resource}) must be lowercase words separated by hyphens.");

        var group = Required("group");
        if (Groups.All(g => g.Key != group))
            throw new InvalidOperationException($"Content definition {resource} names unknown group '{group}'.");

        var permission = Str(root["permission"]) ?? AdminPermissions.ContentPublish;
        if (permission == AdminPermissions.All || !AdminPermissions.IsKnown(permission))
            throw new InvalidOperationException($"Content definition {resource} names unknown permission '{permission}'.");

        var schema = root["schema"] as JsonArray
            ?? throw new InvalidOperationException($"Content definition {resource} is missing its \"schema\" array.");
        var fields = ParseFields(schema, $"{resource} schema");

        var problems = new List<string>();
        CheckShape(fields, root["content"], "content", problems);

        var defaults = Normalize(fields, root["content"], null);
        problems.AddRange(Validate(fields, defaults));

        if (problems.Count > 0)
            throw new InvalidOperationException(
                $"Default content in {resource} does not match its schema:\n  - " + string.Join("\n  - ", problems));

        return new Definition
        {
            Key = key,
            Group = group,
            Order = (root["order"] as JsonValue)?.TryGetValue<int>(out var order) == true ? order : 0,
            TitleEn = Required("titleEn"),
            TitleAr = Required("titleAr"),
            Route = Str(root["route"]),
            Permission = permission,
            Schema = (JsonArray)schema.DeepClone(),
            Fields = fields,
            Defaults = defaults,
        };
    }

    private static List<Field> ParseFields(JsonArray array, string path)
    {
        var result = new List<Field>();
        var names = new HashSet<string>(StringComparer.Ordinal);

        foreach (var node in array)
        {
            if (node is not JsonObject field)
                throw new InvalidOperationException($"{path}: every field must be an object.");

            var name = Str(field["name"]) ?? throw new InvalidOperationException($"{path}: a field is missing \"name\".");
            var type = Str(field["type"]) ?? throw new InvalidOperationException($"{path}.{name}: missing \"type\".");

            if (!KnownTypes.Contains(type))
                throw new InvalidOperationException($"{path}.{name}: unknown type '{type}'.");
            if (!names.Add(name))
                throw new InvalidOperationException($"{path}: field '{name}' is declared twice.");

            IReadOnlyList<Field> children = type is "group" or "list"
                ? ParseFields(field["fields"] as JsonArray
                              ?? throw new InvalidOperationException($"{path}.{name}: a {type} needs \"fields\"."),
                              $"{path}.{name}")
                : [];

            IReadOnlyList<string> options = type == "select"
                ? (field["options"] as JsonArray
                   ?? throw new InvalidOperationException($"{path}.{name}: a select needs \"options\"."))
                    .Select(o => o is JsonObject option ? Str(option["value"]) : Str(o))
                    .OfType<string>()
                    .ToList()
                : [];

            result.Add(new Field(name, type, children, options));
        }

        return result;
    }

    /// <summary>
    /// Builds a complete content object for <paramref name="fields"/>: every
    /// field present and correctly typed, unknown properties dropped. Values
    /// come from <paramref name="value"/>, then <paramref name="fallback"/> for
    /// anything missing, then empty. A list present in <paramref name="value"/>
    /// is taken whole, even when empty.
    /// </summary>
    public static JsonObject Normalize(IReadOnlyList<Field> fields, JsonNode? value, JsonNode? fallback)
    {
        var source = value as JsonObject;
        var backup = fallback as JsonObject;
        var result = new JsonObject();

        foreach (var field in fields)
            result[field.Name] = NormalizeField(field, source?[field.Name], backup?[field.Name]);

        return result;
    }

    private static JsonNode NormalizeField(Field field, JsonNode? value, JsonNode? fallback)
    {
        switch (field.Type)
        {
            case "text":
            case "textarea":
                return new JsonObject
                {
                    ["ar"] = Localized(value, fallback, "ar"),
                    ["en"] = Localized(value, fallback, "en"),
                };

            case "boolean":
                return JsonValue.Create(Bool(value) ?? Bool(fallback) ?? false);

            case "group":
                return Normalize(field.Fields, value, fallback);

            case "list":
                var items = new JsonArray();
                if ((value as JsonArray ?? fallback as JsonArray) is { } source)
                {
                    foreach (var item in source)
                        items.Add(Normalize(field.Fields, item, null));
                }
                return items;

            default:
                return JsonValue.Create(Str(value) ?? Str(fallback) ?? string.Empty);
        }
    }

    private static string Localized(JsonNode? value, JsonNode? fallback, string lang) =>
        (value as JsonObject) is { } own && own.ContainsKey(lang) && Str(own[lang]) is { } text
            ? text
            : Str((fallback as JsonObject)?[lang]) ?? string.Empty;

    /// <summary>Limits and link safety for normalised content. Returns human-readable problems.</summary>
    public static List<string> Validate(IReadOnlyList<Field> fields, JsonObject content)
    {
        var problems = new List<string>();
        ValidateInto(fields, content, string.Empty, problems);
        return problems;
    }

    private static void ValidateInto(IReadOnlyList<Field> fields, JsonObject? content, string path, List<string> problems)
    {
        foreach (var field in fields)
        {
            var at = path.Length == 0 ? field.Name : $"{path}.{field.Name}";
            var node = content?[field.Name];

            switch (field.Type)
            {
                case "text":
                case "textarea":
                    var limit = field.Type == "text" ? 2_000 : 20_000;
                    foreach (var lang in new[] { "ar", "en" })
                    {
                        if ((Str((node as JsonObject)?[lang])?.Length ?? 0) > limit)
                            problems.Add($"{at}.{lang} is longer than {limit} characters");
                    }
                    break;

                case "url":
                case "image":
                case "file":
                    var link = Str(node) ?? string.Empty;
                    if (link.Length > 2_000)
                        problems.Add($"{at} is longer than 2000 characters");
                    else if (link.Length > 0 && !IsSafeLink(link))
                        problems.Add($"{at} must be a site path (/…), an http(s) address, mailto: or tel:");
                    break;

                case "string":
                    if ((Str(node)?.Length ?? 0) > 2_000)
                        problems.Add($"{at} is longer than 2000 characters");
                    break;

                case "select":
                    var choice = Str(node) ?? string.Empty;
                    if (choice.Length > 0 && !field.Options.Contains(choice))
                        problems.Add($"{at} must be one of: {string.Join(", ", field.Options)}");
                    break;

                case "group":
                    ValidateInto(field.Fields, node as JsonObject, at, problems);
                    break;

                case "list":
                    if (node is not JsonArray list) break;
                    if (list.Count > MaxListItems)
                        problems.Add($"{at} has more than {MaxListItems} items");
                    for (var i = 0; i < list.Count; i++)
                        ValidateInto(field.Fields, list[i] as JsonObject, $"{at}[{i}]", problems);
                    break;
            }
        }
    }

    /// <summary>
    /// Links render as href/src on the public site, so anything that could run
    /// script there (javascript:, data:, protocol-relative //host) is refused.
    /// </summary>
    public static bool IsSafeLink(string value)
    {
        var link = value.Trim();
        if (link.StartsWith("//", StringComparison.Ordinal)) return false;
        if (link.StartsWith('/') || link.StartsWith('#')) return true;

        return link.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
               || link.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
               || link.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase)
               || link.StartsWith("tel:", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Strict structural check for authored defaults: unknown properties,
    /// wrong types, and text missing a language are all reported, because a
    /// typo there would otherwise vanish silently during normalisation.
    /// </summary>
    private static void CheckShape(IReadOnlyList<Field> fields, JsonNode? node, string path, List<string> problems)
    {
        if (node is null) return;
        if (node is not JsonObject obj)
        {
            problems.Add($"{path} should be an object");
            return;
        }

        var known = fields.ToDictionary(f => f.Name, StringComparer.Ordinal);

        foreach (var (name, child) in obj)
        {
            var at = $"{path}.{name}";
            if (!known.TryGetValue(name, out var field))
            {
                problems.Add($"{at} is not in the schema");
                continue;
            }

            if (child is null) continue;

            switch (field.Type)
            {
                case "text":
                case "textarea":
                    if (child is not JsonObject localized
                        || !localized.ContainsKey("ar") || !localized.ContainsKey("en")
                        || localized.Any(p => p.Key is not ("ar" or "en") || Str(p.Value) is null))
                        problems.Add($"{at} should be {{ \"ar\": \"…\", \"en\": \"…\" }}");
                    break;

                case "boolean":
                    if (Bool(child) is null) problems.Add($"{at} should be true or false");
                    break;

                case "group":
                    CheckShape(field.Fields, child, at, problems);
                    break;

                case "list":
                    if (child is not JsonArray list)
                    {
                        problems.Add($"{at} should be a list");
                        break;
                    }
                    for (var i = 0; i < list.Count; i++)
                        CheckShape(field.Fields, list[i], $"{at}[{i}]", problems);
                    break;

                default:
                    if (Str(child) is null) problems.Add($"{at} should be a string");
                    break;
            }
        }
    }

    private static string? Str(JsonNode? node) =>
        node is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;

    private static bool? Bool(JsonNode? node) =>
        node is JsonValue value && value.TryGetValue<bool>(out var flag) ? flag : null;
}
