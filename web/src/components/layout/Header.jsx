import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLang } from '../../context/LanguageContext';
import { IconChevron } from '../icons/Icons';

export default function Header() {
  const { t } = useTranslation();
  const { lang, toggleLang } = useLang();
  const location = useLocation();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const headerRef = useRef(null);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setOpenDropdown(null);
    document.body.style.overflow = '';
  }, [location.pathname]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setOpenDropdown(null);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function toggleMobileMenu() {
    setMenuOpen((open) => {
      const next = !open;
      document.body.style.overflow = next ? 'hidden' : '';
      return next;
    });
  }

  /**
   * Width at or below which the menu is the drawer rather than the desktop row,
   * where a dropdown opens on tap instead of on hover.
   *
   * This was 1680px, because the row carried nine primary items plus the call
   * to action and the language toggle and needed ~1555px in English. The effect
   * was that every ordinary laptop — 1440px and below — got a hamburger and an
   * 88px bar holding nothing but a logo and two buttons.
   *
   * The row now carries six items: the two utility links moved to the top bar
   * and the unbuilt "development pathways" entry moved into the federation
   * menu, so it fits comfortably here instead.
   *
   * Keep in sync with the nav breakpoint in
   * public/assets/css/stylec7a3.css (§23b).
   */
  const NAV_DRAWER_MAX_WIDTH = 1080;

  function isMobile() {
    return window.innerWidth <= NAV_DRAWER_MAX_WIDTH;
  }

  function handleDropdownTrigger(key, e) {
    if (!isMobile()) return;
    e.preventDefault();
    setOpenDropdown((cur) => (cur === key ? null : key));
  }

  const navItems = [
    { key: 'home', to: '/', label: t('nav.home') },
    {
      key: 'federation',
      label: t('nav.federation'),
      dropdown: [
        {
          heading: t('nav.federation'),
          links: [
            { to: '/organization/overview', label: t('nav.federationOverview') },
            { to: '/organization/history', label: t('nav.federationHistory') },
            { to: '/organization/values', label: t('nav.federationValues') },
            { to: '/organization/strategy', label: t('nav.federationStrategy') },
            { to: '/organization/initiatives', label: t('nav.federationInitiatives') },
            { to: '/organization/goals', label: t('nav.federationGoals') },
            { to: '/organization/achievements', label: t('nav.federationAchievements') },
            { to: '/organization/results-archive', label: t('nav.federationResultsArchive') },
            { label: t('nav.pathways'), soon: true },
          ],
        },
        {
          heading: t('nav.governance'),
          links: [
            { to: '/governance/recognition', label: t('nav.governanceRecognition') },
            { to: '/governance/hq', label: t('nav.governanceHq') },
            { to: '/governance/committees', label: t('nav.governanceCommittees') },
            { to: '/governance/health-doping', label: t('nav.governanceHealth') },
            { to: '/governance/reports', label: t('nav.governanceReports') },
            { to: '/governance/policies', label: t('nav.governancePolicies') },
          ],
        },
      ],
    },
    {
      key: 'about-muaythai',
      label: t('nav.aboutMuaythai'),
      dropdown: [
        {
          links: [
            { to: '/about-muaythai/history', label: t('nav.aboutHistory') },
            { to: '/about-muaythai/pillars', label: t('nav.aboutPillars') },
            { to: '/about-muaythai/disciplines', label: t('nav.aboutDisciplines') },
            { to: '/about-muaythai/rules', label: t('nav.aboutRules') },
            { to: '/about-muaythai/equipment', label: t('nav.aboutEquipment') },
          ],
        },
      ],
    },
    { key: 'news', to: '/news', label: t('nav.news') },
    { key: 'activities', to: '/activities/calendar', label: t('nav.activities') },
    {
      key: 'registration',
      label: t('nav.registration'),
      dropdown: [
        {
          links: [
            { to: '/registration/athlete', label: t('nav.registrationAthlete') },
            { to: '/registration/club', label: t('nav.registrationClub') },
            { to: '/registration/coach', label: t('nav.registrationCoach') },
            { to: '/registration/official', label: t('nav.registrationOfficial') },
          ],
        },
      ],
    },
  ];

  /**
   * Reporting a violation and contacting the federation are utility actions,
   * not primary navigation. On desktop they live in the top bar; here they are
   * appended to the drawer so a phone still reaches them from the one menu.
   */
  const drawerUtilityItems = [
    { key: 'whistleblower', to: '/whistleblower', label: t('nav.whistleblower'), whistle: true },
    { key: 'contact', to: '/contact', label: t('nav.contact') },
  ];

  return (
    <>
      <header ref={headerRef} className={`site-header${scrolled ? ' scrolled' : ''}`}>
        <nav className="main-nav container">
          <div className="main-nav__inner">
            <Link to="/" className="main-nav__brand" aria-label={t('govtBar.name')}>
              <img className="main-nav__brand-mark" src="/assets/images/logo.png" alt="" />
              <span className="main-nav__brand-text">
                <span className="main-nav__brand-name">{t('govtBar.name')}</span>
                <span className="main-nav__brand-alt">{t('govtBar.nameAlt')}</span>
              </span>
            </Link>

            <ul id="main-menu" className={`main-nav__menu${menuOpen ? ' open' : ''}`}>
              {navItems.map((item) => {
                if (item.soon) {
                  return (
                    <li key={item.key} className="main-nav__item">
                      <span className="main-nav__link main-nav__coming-soon">
                        {item.label}
                        <span>{t('common.comingSoon')}</span>
                      </span>
                    </li>
                  );
                }

                if (item.dropdown) {
                  const isOpen = openDropdown === item.key;
                  return (
                    <li
                      key={item.key}
                      className={`main-nav__item main-nav__item--dropdown${isOpen ? ' open' : ''}`}
                    >
                      <button
                        type="button"
                        className="main-nav__link"
                        aria-expanded={isOpen}
                        onClick={(e) => handleDropdownTrigger(item.key, e)}
                      >
                        {item.label}
                        <IconChevron aria-hidden="true" />
                      </button>
                      <div className="main-nav__dropdown">
                        <div className="main-nav__dropdown-inner">
                          {item.dropdown.map((col, idx) => (
                            <div className="main-nav__dropdown-col" key={col.heading || idx}>
                              {col.heading && (
                                <span className="main-nav__dropdown-heading">{col.heading}</span>
                              )}
                              <ul>
                                {col.links.map((link) =>
                                  link.soon ? (
                                    <li key={link.label} className="main-nav__coming-soon">
                                      <span>
                                        {link.label} <span>{t('common.comingSoon')}</span>
                                      </span>
                                    </li>
                                  ) : (
                                    <li key={link.to}>
                                      <Link to={link.to}>{link.label}</Link>
                                    </li>
                                  ),
                                )}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={item.key} className="main-nav__item">
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `main-nav__link${item.whistle ? ' main-nav__link--whistle' : ''}${isActive ? '' : ''}`
                      }
                      end={item.to === '/'}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                );
              })}

              {/* Utility links live in the top bar on desktop; the drawer is the
                  only menu on a phone, so they are repeated here. */}
              {drawerUtilityItems.map((item) => (
                <li key={item.key} className="main-nav__item main-nav__item--utility">
                  <NavLink
                    to={item.to}
                    className={`main-nav__link${item.whistle ? ' main-nav__link--whistle' : ''}`}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}

              {/* Same call to action as the one in the controls strip, surfaced
                  inside the drawer because the desktop button is hidden on
                  phones — the Arabic label is too long to sit beside the logo. */}
              <li className="main-nav__item main-nav__item--cta">
                <Link to="/try-muaythai" className="nav-cta nav-cta--block">
                  {t('nav.tryMuaythai')}
                </Link>
              </li>
            </ul>

            <div className="main-nav__controls">
              <Link to="/try-muaythai" className="nav-cta nav-cta--inline">
                {t('nav.tryMuaythai')}
              </Link>
              <button type="button" className="lang-toggle" onClick={toggleLang}>
                {lang === 'ar' ? 'English' : 'عربي'}
              </button>
              <button
                type="button"
                className={`hamburger${menuOpen ? ' open' : ''}`}
                aria-label="Menu"
                aria-expanded={menuOpen}
                onClick={toggleMobileMenu}
              >
                <span className="hamburger__bar" />
                <span className="hamburger__bar" />
                <span className="hamburger__bar" />
              </button>
            </div>
          </div>
        </nav>
      </header>
      <div
        id="mobile-overlay"
        className={`mobile-menu-overlay${menuOpen ? ' active' : ''}`}
        onClick={toggleMobileMenu}
      />
    </>
  );
}
