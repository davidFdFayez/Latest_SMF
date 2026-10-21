import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconEmail } from '../icons/Icons';
import { useSiteContent } from '../../content/site';
import { SOCIAL_PLATFORMS, socialAccounts } from './socialPlatforms';

export default function GovtBar() {
  const { t } = useTranslation();
  const { site, navLabel } = useSiteContent();

  const email = site ? site.contact?.email : t('govtBar.email');
  const socials = socialAccounts(site, { topBarOnly: true });

  return (
    <div className="govt-bar">
      <div className="container govt-bar__inner">
        {/* The federation name moved to the brand lockup beside the logo, where
            it belongs. This bar now carries contact details on one side and the
            two utility links on the other, so both halves do something instead
            of framing a gap. */}
        <div className="govt-bar__left">
          {email && (
            <a className="govt-bar__link" href={`mailto:${email}`}>
              <IconEmail aria-hidden="true" />
              <span>{email}</span>
            </a>
          )}
          <div className="govt-bar__socials">
            {socials.map(({ platform, url }, index) => {
              const { Icon, label } = SOCIAL_PLATFORMS[platform];
              return (
                <a key={`${platform}-${index}`} href={url} target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <Icon aria-hidden="true" />
                </a>
              );
            })}
          </div>
        </div>

        <div className="govt-bar__right">
          <Link className="govt-bar__link govt-bar__link--whistle" to="/whistleblower">
            {navLabel('whistleblower')}
          </Link>
          <span className="govt-bar__divider" aria-hidden="true" />
          <Link className="govt-bar__link" to="/contact">
            {navLabel('contact')}
          </Link>
        </div>
      </div>
    </div>
  );
}
