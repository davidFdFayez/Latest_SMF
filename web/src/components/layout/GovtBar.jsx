import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconEmail, IconWhatsApp, IconXTwitter, IconInstagram, IconYouTube, IconSnapchat, IconTikTok, IconLinkedIn } from '../icons/Icons';
import { socialStrip } from '../../data/socialLinks';

/* CNT-06 — URLs come from the one shared list; this only sets the order. */
const ICONS = {
  whatsapp: IconWhatsApp,
  x: IconXTwitter,
  instagram: IconInstagram,
  youtube: IconYouTube,
  snapchat: IconSnapchat,
  tiktok: IconTikTok,
  linkedin: IconLinkedIn,
};

const SOCIALS = socialStrip(['whatsapp', 'x', 'instagram', 'youtube', 'snapchat', 'tiktok', 'linkedin'])
  .map((entry) => ({ ...entry, Icon: ICONS[entry.key] }));

export default function GovtBar() {
  const { t } = useTranslation();

  return (
    <div className="govt-bar">
      <div className="container govt-bar__inner">
        {/* The federation name moved to the brand lockup beside the logo, where
            it belongs. This bar now carries contact details on one side and the
            two utility links on the other, so both halves do something instead
            of framing a gap. */}
        <div className="govt-bar__left">
          <a className="govt-bar__link" href={`mailto:${t('govtBar.email')}`}>
            <IconEmail aria-hidden="true" />
            <span>{t('govtBar.email')}</span>
          </a>
          <div className="govt-bar__socials">
            {SOCIALS.map(({ key, href, Icon, label }) => (
              <a key={key} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
                <Icon aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        <div className="govt-bar__right">
          <Link className="govt-bar__link govt-bar__link--whistle" to="/whistleblower">
            {t('nav.whistleblower')}
          </Link>
          <span className="govt-bar__divider" aria-hidden="true" />
          <Link className="govt-bar__link" to="/contact">
            {t('nav.contact')}
          </Link>
        </div>
      </div>
    </div>
  );
}
