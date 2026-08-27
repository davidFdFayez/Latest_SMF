namespace Smf.Api.Data;

/// <summary>
/// The ISO 3166-1 alpha-2 country codes and the ITU-T E.164 calling codes the
/// registration portal accepts (REG-02, REG-07, REG-08).
///
/// Generated from web/src/data/countries.js so the API can never accept a
/// nationality or a dialling prefix the form itself would not have produced.
/// </summary>
public static class IsoCountries
{
    private const string CodeList =
        "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR "
      + "BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ "
      + "EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW "
      + "GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY "
      + "KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV "
      + "MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY "
      + "QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG "
      + "TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM "
      + "ZW ";

    private const string DialList =
        "1 7 20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 "
      + "63 64 65 66 81 82 84 86 90 91 92 93 94 95 98 211 212 213 216 218 220 221 222 223 224 225 226 "
      + "227 228 229 230 231 232 233 234 235 236 237 238 239 240 241 242 243 244 245 246 248 249 250 "
      + "251 252 253 254 255 256 257 258 260 261 262 263 264 265 266 267 268 269 290 291 297 298 299 "
      + "350 351 352 353 354 355 356 357 358 359 370 371 372 373 374 375 376 377 378 379 380 381 382 "
      + "385 386 387 389 420 421 423 500 501 502 503 504 505 506 507 508 509 590 591 592 593 594 595 "
      + "596 597 598 599 670 672 673 674 675 676 677 678 679 680 681 682 683 685 686 687 688 689 690 "
      + "691 692 850 852 853 855 856 880 886 960 961 962 963 964 965 966 967 968 970 971 972 973 974 "
      + "975 976 977 992 993 994 995 996 998 1242 1246 1264 1268 1284 1340 1345 1441 1473 1649 1664 "
      + "1670 1671 1684 1721 1758 1767 1784 1787 1809 1868 1869 1876 ";

    public static readonly HashSet<string> Alpha2 =
        new(CodeList.Split(' ', StringSplitOptions.RemoveEmptyEntries), StringComparer.OrdinalIgnoreCase);

    public static readonly HashSet<string> CallingCodes =
        new(DialList.Split(' ', StringSplitOptions.RemoveEmptyEntries), StringComparer.Ordinal);

    public static bool IsAlpha2(string? value) =>
        !string.IsNullOrWhiteSpace(value) && Alpha2.Contains(value.Trim());

    /// <summary>True when an E.164 number opens with an assigned calling code.</summary>
    public static bool HasKnownCallingCode(string e164)
    {
        var digits = e164.TrimStart('+');
        for (var length = Math.Min(4, digits.Length); length >= 1; length--)
        {
            if (CallingCodes.Contains(digits[..length])) return true;
        }
        return false;
    }
}
