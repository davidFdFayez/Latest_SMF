import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  IconEmail,
  IconPhone,
  IconLocation,
  IconClock,
  IconWhatsApp,
  IconXTwitter,
  IconInstagram,
  IconYouTube,
  IconSnapchat,
  IconTikTok,
  IconLinkedIn,
  IconThreads,
} from '../icons/Icons';
import { socialStrip } from '../../data/socialLinks';

/*
 * Official channels per the federation's approved content requirements (§4).
 * CNT-06 — the footer used to carry its own Snapchat URL, so the bundle shipped
 * two conflicting ones. Both strips now read the shared list.
 */
const ICONS = {
  whatsapp: IconWhatsApp,
  x: IconXTwitter,
  instagram: IconInstagram,
  threads: IconThreads,
  tiktok: IconTikTok,
  linkedin: IconLinkedIn,
  snapchat: IconSnapchat,
  youtube: IconYouTube,
};

const SOCIALS = socialStrip(['whatsapp', 'x', 'instagram', 'threads', 'tiktok', 'linkedin', 'snapchat', 'youtube'])
  .map((entry) => ({ ...entry, Icon: ICONS[entry.key] }));

export default function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  const quickLinks = [
    // QA-01 — /try-muaythai existed but nothing linked to it.
    { to: '/try-muaythai', label: t('nav.tryMuaythai') },
    { to: '/organization/overview', label: t('nav.federationOverview') },
    { to: '/organization/achievements', label: t('nav.federationAchievements') },
    { to: '/organization/results-archive', label: t('nav.federationResultsArchive') },
    { to: '/news', label: t('nav.news') },
    { to: '/activities/calendar', label: t('nav.activitiesCalendar') },
    { to: '/registration/athlete', label: t('nav.registrationAthlete') },
    { to: '/whistleblower', label: t('nav.whistleblower') },
    { to: '/contact', label: t('nav.contact') },
  ];

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <img src="/assets/images/logo-white.png" alt={t('meta.siteName')} />
          <p className="site-footer__tagline">{t('footer.tagline')}</p>
          <div className="site-footer__socials">
            {SOCIALS.map(({ key, href, Icon, label }) => (
              <a key={key} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
                <Icon aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        <div className="site-footer__nav">
          <span className="site-footer__nav-heading">{t('footer.quickLinks')}</span>
          <ul>
            {quickLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="site-footer__nav">
          <span className="site-footer__nav-heading">{t('footer.contactUs')}</span>
          <ul className="site-footer__contact-list">
            <li>
              <IconEmail aria-hidden="true" />
              <a href="mailto:info@saudimuaythai.sa">info@saudimuaythai.sa</a>
            </li>
            <li>
              <IconPhone aria-hidden="true" className="footer-wa-icon" />
              <a href="tel:+966552677377">+966 55 267 7377</a>
            </li>
            <li>
              <IconLocation aria-hidden="true" />
              <span>{t('footer.address')}</span>
            </li>
            <li>
              <IconClock aria-hidden="true" />
              <span>{t('footer.workingHours')}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="site-footer__bottom">
        <div className="container site-footer__bottom-inner">
          <p>
            &copy; {year} {t('footer.federationName')}. {t('footer.rights')}.
          </p>
          <p className="site-footer__bottom-sub">Saudi Muaythai Federation (SMF)</p>
        </div>
      </div>
    </footer>
  );
}
