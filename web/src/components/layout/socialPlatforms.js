import {
  IconWhatsApp,
  IconXTwitter,
  IconInstagram,
  IconThreads,
  IconTikTok,
  IconLinkedIn,
  IconSnapchat,
  IconYouTube,
} from '../icons/Icons';

/**
 * Icon and accessible name per social platform. The accounts themselves — and
 * their order — are edited in the admin console (site content → social).
 */
export const SOCIAL_PLATFORMS = {
  whatsapp: { label: 'WhatsApp', Icon: IconWhatsApp },
  x: { label: 'X', Icon: IconXTwitter },
  instagram: { label: 'Instagram', Icon: IconInstagram },
  threads: { label: 'Threads', Icon: IconThreads },
  tiktok: { label: 'TikTok', Icon: IconTikTok },
  linkedin: { label: 'LinkedIn', Icon: IconLinkedIn },
  snapchat: { label: 'Snapchat', Icon: IconSnapchat },
  youtube: { label: 'YouTube', Icon: IconYouTube },
};

/** The site's social accounts that have a link and a known platform. */
export function socialAccounts(site, { topBarOnly = false } = {}) {
  return (site?.social ?? []).filter(
    (account) => account.url && SOCIAL_PLATFORMS[account.platform] && (!topBarOnly || account.showInTopBar),
  );
}
