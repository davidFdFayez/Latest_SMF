using System.Text;

namespace Smf.Api.Services;

/// <summary>
/// A QR encoder, just large enough for a membership-card link.
///
/// A card has to be scannable — that is the whole point of printing one — and
/// the code has to appear on both the console (to print) and the public card
/// (to show at a door). A server-side SVG serves both from one implementation
/// and keeps a JavaScript dependency out of two front ends.
///
/// Deliberately narrow: byte mode, error correction level M, versions 1–10.
/// That carries 216 bytes, where the longest link the federation will ever
/// issue is under a hundred. Anything longer is refused rather than silently
/// truncated.
///
/// Follows ISO/IEC 18004, and was checked module-for-module against an
/// independent encoder while it was written — every mask, every version in
/// range, ASCII and multi-byte payloads — because a QR code that is subtly
/// wrong looks exactly like one that is right. That comparison found two
/// defects an eyeball would not have: alignment patterns sitting on the timing
/// line were being skipped, and the two copies of the format information were
/// transposed.
///
/// The mask is the lowest-penalty one for the *finished* symbol, format bits
/// included, which is what §7.8.3 asks for. Some encoders score the symbol
/// before the format bits are written and so land on a different mask; both
/// are readable, so a code from here may differ from one of those and still be
/// correct.
/// </summary>
public static class QrCode
{
    /// <summary>Data codewords available at level M, indexed by version.</summary>
    private static readonly int[] DataCodewords =
        [0, 16, 28, 44, 64, 86, 108, 124, 154, 182, 216];

    /// <summary>Per version at level M: (ecc per block, blocks in group 1, data per block in group 1, blocks in group 2, data per block in group 2).</summary>
    private static readonly (int Ecc, int Blocks1, int Data1, int Blocks2, int Data2)[] BlockLayout =
    [
        default,
        (10, 1, 16, 0, 0),
        (16, 1, 28, 0, 0),
        (26, 1, 44, 0, 0),
        (18, 2, 32, 0, 0),
        (24, 2, 43, 0, 0),
        (16, 4, 27, 0, 0),
        (18, 4, 31, 0, 0),
        (22, 2, 38, 2, 39),
        (22, 3, 36, 2, 37),
        (26, 4, 43, 1, 44),
    ];

    /// <summary>Row/column centres of the alignment patterns, by version.</summary>
    private static readonly int[][] AlignmentCentres =
    [
        [], [],
        [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
        [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
    ];

    private const int MaxVersion = 10;

    /// <summary>The encoded symbol: <c>Size × Size</c> modules, true where dark.</summary>
    public sealed record Symbol(int Size, bool[,] Modules);

    /// <summary>
    /// Encodes text, choosing the smallest version that holds it.
    /// </summary>
    /// <param name="forceMask">
    /// Use this mask instead of the best-scoring one. Only for checking the
    /// encoder against a reference implementation, which cannot be done while
    /// both sides are free to pick a different mask. Production callers leave
    /// it null.
    /// </param>
    public static Symbol Encode(string text, int? forceMask = null)
    {
        var data = Encoding.UTF8.GetBytes(text ?? string.Empty);

        var version = 1;
        while (version <= MaxVersion && !Fits(data.Length, version)) version++;

        if (version > MaxVersion)
        {
            throw new ArgumentException(
                $"{data.Length} bytes is more than a version-{MaxVersion} QR code holds at error correction M.",
                nameof(text));
        }

        var codewords = BuildCodewords(data, version);
        return Place(codewords, version, forceMask);
    }

    /// <summary>The symbol as a standalone SVG, sized in CSS pixels.</summary>
    public static string ToSvg(string text, int pixels = 240, int quietModules = 4)
    {
        var symbol = Encode(text);
        var span = symbol.Size + (quietModules * 2);

        var svg = new StringBuilder();
        svg.Append("<svg xmlns=\"http://www.w3.org/2000/svg\" ")
           .Append($"width=\"{pixels}\" height=\"{pixels}\" viewBox=\"0 0 {span} {span}\" ")
           .Append("shape-rendering=\"crispEdges\" role=\"img\" ")
           .Append("aria-label=\"QR code linking to this membership card\">")
           .Append($"<rect width=\"{span}\" height=\"{span}\" fill=\"#ffffff\"/>")
           .Append("<path fill=\"#000000\" d=\"");

        // One path of unit squares: far fewer nodes than one <rect> per module.
        for (var y = 0; y < symbol.Size; y++)
        {
            for (var x = 0; x < symbol.Size; x++)
            {
                if (symbol.Modules[y, x])
                    svg.Append($"M{x + quietModules} {y + quietModules}h1v1h-1z");
            }
        }

        return svg.Append("\"/></svg>").ToString();
    }

    private static bool Fits(int byteCount, int version)
    {
        // Mode indicator (4 bits) + character count (8 bits below version 10,
        // 16 from version 10) + the data itself.
        var header = 4 + (version < 10 ? 8 : 16);
        return header + (byteCount * 8) <= DataCodewords[version] * 8;
    }

    /* ── bitstream → interleaved codewords ─────────────────────────────── */

    private static byte[] BuildCodewords(byte[] data, int version)
    {
        var capacity = DataCodewords[version];
        var bits = new BitWriter();

        bits.Write(0b0100, 4);                              // byte mode
        bits.Write(data.Length, version < 10 ? 8 : 16);     // character count
        foreach (var b in data) bits.Write(b, 8);

        // Terminator, then pad to a whole codeword, then the alternating pad bytes.
        bits.Write(0, Math.Min(4, (capacity * 8) - bits.Length));
        while (bits.Length % 8 != 0) bits.Write(0, 1);

        var padding = new byte[] { 0xEC, 0x11 };
        for (var i = 0; bits.Length < capacity * 8; i++) bits.Write(padding[i % 2], 8);

        var payload = bits.ToBytes();
        var (eccPerBlock, blocks1, data1, blocks2, data2) = BlockLayout[version];

        // Split into blocks, each with its own error-correction codewords.
        var dataBlocks = new List<byte[]>();
        var eccBlocks = new List<byte[]>();
        var offset = 0;

        foreach (var (count, size) in new[] { (blocks1, data1), (blocks2, data2) })
        {
            for (var i = 0; i < count; i++)
            {
                var block = payload[offset..(offset + size)];
                offset += size;
                dataBlocks.Add(block);
                eccBlocks.Add(ReedSolomon.Remainder(block, eccPerBlock));
            }
        }

        // Interleave: the first codeword of every block, then the second, and
        // so on, so a scratch across the symbol damages every block a little
        // rather than one block fatally.
        var result = new List<byte>(capacity + (eccPerBlock * dataBlocks.Count));

        for (var i = 0; i < dataBlocks.Max(b => b.Length); i++)
            foreach (var block in dataBlocks)
                if (i < block.Length) result.Add(block[i]);

        for (var i = 0; i < eccPerBlock; i++)
            foreach (var block in eccBlocks)
                result.Add(block[i]);

        return [.. result];
    }

    /* ── module placement ──────────────────────────────────────────────── */

    private static Symbol Place(byte[] codewords, int version, int? forceMask = null)
    {
        var size = (version * 4) + 17;
        var modules = new bool[size, size];
        var reserved = new bool[size, size];

        DrawFinder(modules, reserved, 0, 0, size);
        DrawFinder(modules, reserved, size - 7, 0, size);
        DrawFinder(modules, reserved, 0, size - 7, size);
        DrawTiming(modules, reserved, size);
        DrawAlignment(modules, reserved, version);
        ReserveFormat(reserved, size, version);

        // The dark module, always just above the lower-left finder.
        modules[size - 8, 8] = true;
        reserved[size - 8, 8] = true;

        PlaceData(modules, reserved, codewords, size);

        // Every mask is tried and the least ugly wins — that is literally how
        // the standard defines the choice.
        var best = 0;
        var bestPenalty = int.MaxValue;
        bool[,]? bestModules = null;

        for (var mask = 0; mask < 8; mask++)
        {
            if (forceMask is { } only && mask != only) continue;

            var candidate = (bool[,])modules.Clone();
            ApplyMask(candidate, reserved, mask, size);
            DrawFormat(candidate, mask, size);
            if (version >= 7) DrawVersion(candidate, version, size);

            var penalty = Penalty(candidate, size);
            if (penalty < bestPenalty)
            {
                bestPenalty = penalty;
                best = mask;
                bestModules = candidate;
            }
        }

        _ = best;
        return new Symbol(size, bestModules!);
    }

    private static void DrawFinder(bool[,] modules, bool[,] reserved, int left, int top, int size)
    {
        // The 7×7 pattern plus the one-module separator around it.
        for (var y = -1; y <= 7; y++)
        {
            for (var x = -1; x <= 7; x++)
            {
                var row = top + y;
                var column = left + x;
                if (row < 0 || row >= size || column < 0 || column >= size) continue;

                var onRing = (x is >= 0 and <= 6 && y is 0 or 6) || (y is >= 0 and <= 6 && x is 0 or 6);
                var inCore = x is >= 2 and <= 4 && y is >= 2 and <= 4;

                modules[row, column] = onRing || inCore;
                reserved[row, column] = true;
            }
        }
    }

    private static void DrawTiming(bool[,] modules, bool[,] reserved, int size)
    {
        for (var i = 8; i < size - 8; i++)
        {
            var dark = i % 2 == 0;
            modules[6, i] = dark;
            reserved[6, i] = true;
            modules[i, 6] = dark;
            reserved[i, 6] = true;
        }
    }

    private static void DrawAlignment(bool[,] modules, bool[,] reserved, int version)
    {
        var centres = AlignmentCentres[version];
        var last = centres.Length - 1;

        for (var i = 0; i < centres.Length; i++)
        {
            for (var j = 0; j < centres.Length; j++)
            {
                // The three corners already carry finder patterns. This has to
                // be decided by position: testing "is it reserved?" also skips
                // the patterns that legitimately sit on the timing line, which
                // silently corrupts every symbol from version 2 up.
                if ((i == 0 && j == 0) || (i == 0 && j == last) || (i == last && j == 0)) continue;

                var row = centres[i];
                var column = centres[j];

                for (var dy = -2; dy <= 2; dy++)
                {
                    for (var dx = -2; dx <= 2; dx++)
                    {
                        modules[row + dy, column + dx] =
                            Math.Max(Math.Abs(dx), Math.Abs(dy)) != 1;
                        reserved[row + dy, column + dx] = true;
                    }
                }
            }
        }
    }

    private static void ReserveFormat(bool[,] reserved, int size, int version)
    {
        for (var i = 0; i < 9; i++)
        {
            reserved[8, i] = true;
            reserved[i, 8] = true;
        }
        for (var i = 0; i < 8; i++)
        {
            reserved[8, size - 1 - i] = true;
            reserved[size - 1 - i, 8] = true;
        }

        if (version < 7) return;

        for (var i = 0; i < 6; i++)
        {
            for (var j = 0; j < 3; j++)
            {
                reserved[i, size - 11 + j] = true;
                reserved[size - 11 + j, i] = true;
            }
        }
    }

    private static void PlaceData(bool[,] modules, bool[,] reserved, byte[] codewords, int size)
    {
        var bit = 0;
        var total = codewords.Length * 8;
        var upward = true;

        // Two-module columns, right to left, skipping the vertical timing line.
        for (var right = size - 1; right > 0; right -= 2)
        {
            if (right == 6) right = 5;

            for (var step = 0; step < size; step++)
            {
                var row = upward ? size - 1 - step : step;

                for (var column = right; column > right - 2; column--)
                {
                    if (reserved[row, column]) continue;

                    var dark = false;
                    if (bit < total)
                    {
                        dark = (codewords[bit / 8] >> (7 - (bit % 8)) & 1) == 1;
                        bit++;
                    }
                    modules[row, column] = dark;
                }
            }

            upward = !upward;
        }
    }

    private static void ApplyMask(bool[,] modules, bool[,] reserved, int mask, int size)
    {
        for (var row = 0; row < size; row++)
        {
            for (var column = 0; column < size; column++)
            {
                if (reserved[row, column]) continue;
                if (Masked(mask, row, column)) modules[row, column] = !modules[row, column];
            }
        }
    }

    private static bool Masked(int mask, int row, int column) => mask switch
    {
        0 => (row + column) % 2 == 0,
        1 => row % 2 == 0,
        2 => column % 3 == 0,
        3 => (row + column) % 3 == 0,
        4 => ((row / 2) + (column / 3)) % 2 == 0,
        5 => (row * column % 2) + (row * column % 3) == 0,
        6 => ((row * column % 2) + (row * column % 3)) % 2 == 0,
        _ => ((row + column) % 2 + (row * column % 3)) % 2 == 0,
    };

    private static void DrawFormat(bool[,] modules, int mask, int size)
    {
        // Error correction level M is 00, so the five bits are just the mask.
        var value = Bch(mask, 0b101_0011_0111, 10) | (mask << 10);
        value ^= 0b101_0100_0001_0010;

        for (var i = 0; i < 15; i++)
        {
            var dark = (value >> i & 1) == 1;

            /* The first copy runs down column 8 beside the top-left finder,
               then turns along row 8 — skipping the timing module at row 6 and
               column 6. Note the order: these are [row, column], where most
               published implementations write (x, y). Getting that backwards
               transposes the two copies, which no scanner will read. */
            if (i < 6) modules[i, 8] = dark;
            else if (i < 8) modules[i + 1, 8] = dark;
            else if (i == 8) modules[8, 7] = dark;
            else modules[8, 14 - i] = dark;

            // The second copy is split between the other two finders.
            if (i < 8) modules[8, size - 1 - i] = dark;
            else modules[size - 15 + i, 8] = dark;
        }
    }

    private static void DrawVersion(bool[,] modules, int version, int size)
    {
        var value = Bch(version, 0b1_1111_0010_0101, 12) | (version << 12);

        for (var i = 0; i < 18; i++)
        {
            var dark = (value >> i & 1) == 1;
            modules[i / 3, size - 11 + (i % 3)] = dark;
            modules[size - 11 + (i % 3), i / 3] = dark;
        }
    }

    /// <summary>Remainder of <paramref name="value"/> shifted up, divided by the generator.</summary>
    private static int Bch(int value, int generator, int degree)
    {
        var remainder = value << degree;
        var generatorBits = BitLength(generator);

        while (BitLength(remainder) >= generatorBits)
            remainder ^= generator << (BitLength(remainder) - generatorBits);

        return remainder;
    }

    private static int BitLength(int value)
    {
        var length = 0;
        while (value != 0)
        {
            length++;
            value >>= 1;
        }
        return length;
    }

    /* ── mask scoring (the four rules in §7.8.3) ───────────────────────── */

    private static int Penalty(bool[,] modules, int size)
    {
        var score = 0;

        // Rule 1 — runs of five or more of the same colour, each way.
        for (var i = 0; i < size; i++)
        {
            score += RunPenalty(modules, size, i, horizontal: true);
            score += RunPenalty(modules, size, i, horizontal: false);
        }

        // Rule 2 — every 2×2 block of one colour.
        for (var row = 0; row < size - 1; row++)
        {
            for (var column = 0; column < size - 1; column++)
            {
                var first = modules[row, column];
                if (first == modules[row, column + 1]
                    && first == modules[row + 1, column]
                    && first == modules[row + 1, column + 1])
                {
                    score += 3;
                }
            }
        }

        // Rule 3 — the finder-like 1:1:3:1:1 sequence with four light modules
        // on either side, which a scanner could mistake for a finder.
        bool[] forward = [true, false, true, true, true, false, true, false, false, false, false];
        bool[] backward = [false, false, false, false, true, false, true, true, true, false, true];

        for (var row = 0; row < size; row++)
        {
            for (var column = 0; column <= size - 11; column++)
            {
                if (Matches(modules, row, column, forward, horizontal: true)
                    || Matches(modules, row, column, backward, horizontal: true))
                {
                    score += 40;
                }
                if (Matches(modules, column, row, forward, horizontal: false)
                    || Matches(modules, column, row, backward, horizontal: false))
                {
                    score += 40;
                }
            }
        }

        // Rule 4 — how far the dark proportion strays from half.
        var dark = 0;
        foreach (var module in modules) if (module) dark++;

        var percent = dark * 100 / (size * size);
        score += Math.Abs(percent - 50) / 5 * 10;

        return score;
    }

    private static int RunPenalty(bool[,] modules, int size, int line, bool horizontal)
    {
        var score = 0;
        var run = 1;

        for (var i = 1; i < size; i++)
        {
            var current = horizontal ? modules[line, i] : modules[i, line];
            var previous = horizontal ? modules[line, i - 1] : modules[i - 1, line];

            if (current == previous)
            {
                run++;
                if (run == 5) score += 3;
                else if (run > 5) score += 1;
            }
            else
            {
                run = 1;
            }
        }

        return score;
    }

    private static bool Matches(bool[,] modules, int row, int column, bool[] pattern, bool horizontal)
    {
        for (var i = 0; i < pattern.Length; i++)
        {
            var value = horizontal ? modules[row, column + i] : modules[row + i, column];
            if (value != pattern[i]) return false;
        }
        return true;
    }

    /* ── bit writer ────────────────────────────────────────────────────── */

    private sealed class BitWriter
    {
        private readonly List<byte> _bytes = [];
        private int _partial;
        private int _used;

        public int Length { get; private set; }

        public void Write(int value, int bits)
        {
            for (var i = bits - 1; i >= 0; i--)
            {
                _partial = (_partial << 1) | (value >> i & 1);
                _used++;
                Length++;

                if (_used != 8) continue;
                _bytes.Add((byte)_partial);
                _partial = 0;
                _used = 0;
            }
        }

        public byte[] ToBytes()
        {
            if (_used > 0) _bytes.Add((byte)(_partial << (8 - _used)));
            return [.. _bytes];
        }
    }

    /* ── Reed-Solomon over GF(256) ─────────────────────────────────────── */

    private static class ReedSolomon
    {
        private static readonly byte[] Exp = new byte[512];
        private static readonly byte[] Log = new byte[256];

        static ReedSolomon()
        {
            var x = 1;
            for (var i = 0; i < 255; i++)
            {
                Exp[i] = (byte)x;
                Log[x] = (byte)i;
                x <<= 1;
                if (x >= 256) x ^= 0x11D;   // the QR field polynomial
            }
            for (var i = 255; i < 512; i++) Exp[i] = Exp[i - 255];
        }

        private static byte Multiply(byte a, byte b) =>
            a == 0 || b == 0 ? (byte)0 : Exp[Log[a] + Log[b]];

        /// <summary>The generator polynomial for <paramref name="degree"/> check symbols.</summary>
        private static byte[] Generator(int degree)
        {
            var polynomial = new byte[] { 1 };

            for (var i = 0; i < degree; i++)
            {
                var next = new byte[polynomial.Length + 1];
                for (var j = 0; j < polynomial.Length; j++)
                {
                    next[j] ^= polynomial[j];
                    next[j + 1] ^= Multiply(polynomial[j], Exp[i]);
                }
                polynomial = next;
            }

            return polynomial;
        }

        public static byte[] Remainder(byte[] data, int degree)
        {
            var generator = Generator(degree);
            var remainder = new byte[degree];

            foreach (var value in data)
            {
                var factor = (byte)(value ^ remainder[0]);
                Array.Copy(remainder, 1, remainder, 0, degree - 1);
                remainder[degree - 1] = 0;

                for (var i = 0; i < degree; i++)
                    remainder[i] ^= Multiply(generator[i + 1], factor);
            }

            return remainder;
        }
    }
}
