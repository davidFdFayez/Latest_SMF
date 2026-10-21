import { useTranslation } from 'react-i18next';
import { IconEmail, IconPhone, IconLocation, IconClock } from '../icons/Icons';
import { SmartLink } from '../../content/useContent';
import { useSiteContent } from '../../content/site';
import { SOCIAL_PLATFORMS, socialAccounts } from './socialPlatforms';

/*
 * Official channels per the federation's approved content requirements (§4).
 * Contact details, social accounts, and the quick links are edited in the admin
 * console (Website Content → Site settings, Menus & footer links).
 */
export default function Footer() {
  const { t } = useTranslation();
  const { site, navigation, tx } = useSiteContent();
  const year = new Date().getFullYear();

  const contact = site?.contact ?? {};
  const federationName = (site && tx(site.identity?.name)) || t('footer.federationName');
  const footer = navigation?.footer;
  const heading = (value, fallbackKey) => (footer && tx(value)) || t(fallbackKey);

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <img src={site?.identity?.footerLogo || '/assets/images/logo-white.png'} alt={federationName} />
          {site && <p className="site-footer__tagline">{tx(site.identity?.tagline)}</p>}
          <div className="site-footer__socials">
            {socialAccounts(site).map(({ platform, url }, index) => {
              const { Icon, label } = SOCIAL_PLATFORMS[platform];
              return (
                <a key={`${platform}-${index}`} href={url} target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <Icon aria-hidden="true" />
                </a>
              );
            })}
          </div>
        </div>

        <div className="site-footer__nav">
          <span className="site-footer__nav-heading">{heading(footer?.quickLinksHeading, 'footer.quickLinks')}</span>
          <ul>
            {(navigation?.footerLinks ?? []).map((link, index) => (
              <li key={`${link.url}-${index}`}>
                <SmartLink to={link.url}>{tx(link.label)}</SmartLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="site-footer__nav">
          <span className="site-footer__nav-heading">{heading(footer?.contactHeading, 'footer.contactUs')}</span>
          <ul className="site-footer__contact-list">
            {contact.email && (
              <li>
                <IconEmail aria-hidden="true" />
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </li>
            )}
            {contact.phoneDisplay && (
              <li>
                <IconPhone aria-hidden="true" className="footer-wa-icon" />
                <a href={`tel:${contact.phoneLink || contact.phoneDisplay}`}>{contact.phoneDisplay}</a>
              </li>
            )}
            {site && tx(contact.address) && (
              <li>
                <IconLocation aria-hidden="true" />
                <span>{tx(contact.address)}</span>
              </li>
            )}
            {site && tx(contact.workingHours) && (
              <li>
                <IconClock aria-hidden="true" />
                <span>
                  {[tx(footer?.hoursLabel), tx(contact.workingHours)].filter(Boolean).join(' ')}
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="site-footer__bottom">
        <div className="container site-footer__bottom-inner">
          <p>
            &copy; {year} {federationName}. {heading(footer?.rights, 'footer.rights')}.
          </p>
          {site?.identity?.shortName && <p className="site-footer__bottom-sub">{site.identity.shortName}</p>}
        </div>
      </div>
    </footer>
  );
}
