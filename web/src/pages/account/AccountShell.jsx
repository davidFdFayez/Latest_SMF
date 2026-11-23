import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHero from '../../components/PageHero';
import { getToken, signOut, subscribeToken } from '../../api/member';
import { IconLogout } from '../../components/icons/AccountIcons';

/**
 * A member's own area of the website: the page hero carrying their name, then
 * one large container with the section navigation on the start side (right
 * in Arabic) and the active section beside it. Logout sits apart at the foot
 * of the navigation. The club, coach and athlete accounts all stand in it.
 */
export default function AccountShell({ title, subtitle, breadcrumb, sections, section, onSection, navLabel, ar, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const leaving = useRef(false);

  // The session ended while the page was open (it expired, or another tab
  // signed out): sign in again, and come back to this very section.
  useEffect(() => subscribeToken(() => {
    if (getToken() || leaving.current) return;
    const here = `${location.pathname}${location.search}`;
    navigate(`/account/login?expired=1&next=${encodeURIComponent(here)}`, { replace: true });
  }), [location.pathname, location.search, navigate]);

  function logOut() {
    // Leaving on purpose goes home, not back to sign-in.
    leaving.current = true;
    signOut();
    navigate('/');
  }

  return (
    <>
      <PageHero title={title} subtitle={subtitle} breadcrumb={[{ label: breadcrumb }]} />

      <section className="section club-account">
        <div className="container">
          <div className="club-dash">
            <nav className="club-dash__nav" aria-label={navLabel}>
              {sections.map(({ key, ar: labelAr, en, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`club-dash__link${section === key ? ' is-active' : ''}`}
                  aria-current={section === key ? 'page' : undefined}
                  onClick={() => onSection(key)}
                >
                  <Icon className="club-dash__link-icon" />
                  <span>{ar ? labelAr : en}</span>
                </button>
              ))}

              {/* Set apart at the foot: easy to find, never mistaken for a section. */}
              <span className="club-dash__spacer" aria-hidden="true" />
              <button type="button" className="club-dash__logout" onClick={logOut}>
                <IconLogout className="club-dash__logout-icon" />
                <span>{ar ? 'تسجيل الخروج' : 'Logout'}</span>
              </button>
            </nav>

            <div className="club-dash__main">{children}</div>
          </div>
        </div>
      </section>
    </>
  );
}
