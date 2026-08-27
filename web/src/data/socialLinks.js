/**
 * The federation's official channels — CNT-06.
 *
 * The header strip and the footer used to keep their own copies, which is how
 * the bundle ended up shipping two different Snapchat URLs and a set of `x.com/
 * saudimuaythai`-style handles that belong to nobody. One list, imported by
 * both, makes that impossible.
 *
 * Verified against the federation's accounts:
 *   X          x.com/smf_ksa
 *   Instagram  instagram.com/smf__ksa/
 *   YouTube    youtube.com/@SaudiMuayThaiFederation
 *   Snapchat   snapchat.com/t/d0QLDkXr
 *   TikTok     tiktok.com/@smf.ksa
 *   Threads    threads.com/@smf__ksa
 *   LinkedIn   linkedin.com/company/saudimuaythai
 *   WhatsApp   wa.me/966552677377
 */

export const SOCIAL_LINKS = {
  whatsapp: { href: 'https://wa.me/966552677377', label: 'WhatsApp' },
  x: { href: 'https://x.com/smf_ksa', label: 'X' },
  instagram: { href: 'https://www.instagram.com/smf__ksa/', label: 'Instagram' },
  threads: { href: 'https://www.threads.com/@smf__ksa', label: 'Threads' },
  youtube: { href: 'https://www.youtube.com/@SaudiMuayThaiFederation', label: 'YouTube' },
  snapchat: { href: 'https://snapchat.com/t/d0QLDkXr', label: 'Snapchat' },
  tiktok: { href: 'https://www.tiktok.com/@smf.ksa', label: 'TikTok' },
  linkedin: { href: 'https://sa.linkedin.com/company/saudimuaythai', label: 'LinkedIn' },
};

/** WhatsApp community invite, shown on the contact page and the homepage (CNT-05). */
export const WHATSAPP_COMMUNITY = 'https://chat.whatsapp.com/IhBwcIcagZqArhmATQoaVG';

/** Direct WhatsApp chat with the federation office. */
export const WHATSAPP_DIRECT = SOCIAL_LINKS.whatsapp.href;

/** Build the ordered strip a layout needs: `socialStrip(['x', 'instagram'])`. */
export const socialStrip = (keys) =>
  keys.map((key) => ({ key, ...SOCIAL_LINKS[key] }));
