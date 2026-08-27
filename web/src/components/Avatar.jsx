/**
 * Branded monogram avatar used wherever a real portrait has not been supplied.
 *
 * The federation's own photography lives in its media library; until those
 * files are dropped in, these render as a deliberate brand element rather than
 * an empty frame. Pass `src` once a real photo exists and it takes over.
 */

/** Two initials from an Arabic or Latin name. */
function initialsOf(name = '') {
  const cleaned = name
    .replace(/[«»"'`.]/g, ' ')
    // Drop honorifics/titles that would otherwise dominate the monogram.
    .replace(/\b(HRH|Mr|Mrs|Ms|Dr|Eng|Prince)\b\.?/gi, ' ')
    .replace(/(صاحب السمو الملكي|الأمير|المهندس|السيد|السيدة|الدكتور)/g, ' ')
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? '') + (parts[1][0] ?? '');
}

/** Stable hue offset so a grid of avatars is varied but never random per render. */
function hueOf(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default function Avatar({ name = '', src, size = 'md', variant = 'green', className = '' }) {
  if (src) {
    return (
      <img
        className={`smf-avatar smf-avatar--${size} smf-avatar--photo ${className}`.trim()}
        src={src}
        alt={name}
        loading="lazy"
      />
    );
  }

  const initials = initialsOf(name);
  const hue = hueOf(name);

  return (
    <span
      className={`smf-avatar smf-avatar--${size} smf-avatar--${variant} ${className}`.trim()}
      style={{ '--smf-avatar-shift': `${hue}deg` }}
      role="img"
      aria-label={name || undefined}
      title={name || undefined}
    >
      <span className="smf-avatar__initials" aria-hidden="true">{initials}</span>
    </span>
  );
}
