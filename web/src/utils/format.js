/** Arabic UI keeps Arabic month/day names, but always uses Western digits 0–9. */
export function intlLocale(lang) {
  return lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB';
}

/** Convert Eastern Arabic / Persian digits to Latin 0-9. */
export function toLatinDigits(value) {
  if (value == null) return '';
  return String(value)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function formatDate(value, lang = 'ar', options = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}) {
  try {
    return toLatinDigits(new Date(value).toLocaleDateString(intlLocale(lang), options));
  } catch {
    return toLatinDigits(value);
  }
}

export function formatDateLong(value, lang = 'ar') {
  return formatDate(value, lang, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateRange(start, end, lang = 'ar', options = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}) {
  try {
    const s = new Date(start);
    if (!end || start === end) {
      return toLatinDigits(s.toLocaleDateString(intlLocale(lang), options));
    }
    const left = s.toLocaleDateString(intlLocale(lang), options);
    const right = new Date(end).toLocaleDateString(intlLocale(lang), options);
    return toLatinDigits(`${left} – ${right}`);
  } catch {
    return toLatinDigits(start);
  }
}

export function formatNumber(value, lang = 'ar', options) {
  try {
    return toLatinDigits(Number(value).toLocaleString(intlLocale(lang), options));
  } catch {
    return toLatinDigits(value);
  }
}
