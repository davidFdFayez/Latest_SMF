import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLang } from '../../context/LanguageContext';
import { SmartLink } from '../../content/useContent';
import { useSiteContent } from '../../content/site';
import { IconChevron } from '../icons/Icons';

export default function Header() {
  const { t } = useTranslation();
  const { lang, toggleLang } = useLang();
  const { site, navigation, navLabel, tx } = useSiteContent();
  const location = useLocation();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const headerRef = useRef(null);

  // Name, logo, and button link come from site content (Website Content in the
  // admin console); the built-in wording stands in until it has loaded.
  const brandName = (site && tx(site.identity?.name)) || t('govtBar.name');
  const brandAlt = (site && site.identity?.name?.[lang === 'ar' ? 'en' : 'ar']) || t('govtBar.nameAlt');
  const brandLogo = site?.identity?.logo || '/assets/images/logo.png';
  const ctaUrl = navigation?.header?.tryMuaythaiUrl || '/try-muaythai';

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
    { key: 'home', to: '/', label: navLabel('home') },
    {
      key: 'federation',
      label: navLabel('federation'),
      dropdown: [
        {
          heading: navLabel('federation'),
          links: [
            { to: '/organization/overview', label: navLabel('federationOverview') },
            { to: '/organization/history', label: navLabel('federationHistory') },
            { to: '/organization/values', label: navLabel('federationValues') },
            { to: '/organization/strategy', label: navLabel('federationStrategy') },
            { to: '/organization/initiatives', label: navLabel('federationInitiatives') },
            { to: '/organization/goals', label: navLabel('federationGoals') },
            { to: '/organization/achievements', label: navLabel('federationAchievements') },
            { to: '/organization/results-archive', label: navLabel('federationResultsArchive') },
            { label: navLabel('pathways'), soon: true },
          ],
        },
        {
          heading: navLabel('governance'),
          links: [
            { to: '/governance/recognition', label: navLabel('governanceRecognition') },
            { to: '/governance/hq', label: navLabel('governanceHq') },
            { to: '/governance/committees', label: navLabel('governanceCommittees') },
            { to: '/governance/health-doping', label: navLabel('governanceHealth') },
            { to: '/governance/reports', label: navLabel('governanceReports') },
            { to: '/governance/policies', label: navLabel('governancePolicies') },
          ],
        },
      ],
    },
    {
      key: 'about-muaythai',
      label: navLabel('aboutMuaythai'),
      dropdown: [
        {
          links: [
            { to: '/about-muaythai/history', label: navLabel('aboutHistory') },
            { to: '/about-muaythai/pillars', label: navLabel('aboutPillars') },
            { to: '/about-muaythai/disciplines', label: navLabel('aboutDisciplines') },
            { to: '/about-muaythai/rules', label: navLabel('aboutRules') },
            { to: '/about-muaythai/equipment', label: navLabel('aboutEquipment') },
          ],
        },
      ],
    },
    { key: 'news', to: '/news', label: navLabel('news') },
    { key: 'activities', to: '/activities/calendar', label: navLabel('activities') },
    {
      key: 'registration',
      label: navLabel('registration'),
      dropdown: [
        {
          links: [
            { to: '/registration/athlete', label: navLabel('registrationAthlete') },
            { to: '/registration/club', label: navLabel('registrationClub') },
            { to: '/registration/coach', label: navLabel('registrationCoach') },
            { to: '/registration/official', label: navLabel('registrationOfficial') },
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
    { key: 'whistleblower', to: '/whistleblower', label: navLabel('whistleblower'), whistle: true },
    { key: 'contact', to: '/contact', label: navLabel('contact') },
  ];

  return (
    <>
      <header ref={headerRef} className={`site-header${scrolled ? ' scrolled' : ''}`}>
        <nav className="main-nav container">
          <div className="main-nav__inner">
            <Link to="/" className="main-nav__brand" aria-label={brandName}>
              <img className="main-nav__brand-mark" src={brandLogo} alt="" />
              <span className="main-nav__brand-text">
                <span className="main-nav__brand-name">{brandName}</span>
                <span className="main-nav__brand-alt">{brandAlt}</span>
              </span>
            </Link>

            <ul id="main-menu" className={`main-nav__menu${menuOpen ? ' open' : ''}`}>
              {navItems.map((item) => {
                if (item.soon) {
                  return (
                    <li key={item.key} className="main-nav__item">
                      <span className="main-nav__link main-nav__coming-soon">
                        {item.label}
                        <span>{navLabel('comingSoon')}</span>
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
                                        {link.label} <span>{navLabel('comingSoon')}</span>
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
                <SmartLink to={ctaUrl} className="nav-cta nav-cta--block">
                  {navLabel('tryMuaythai')}
                </SmartLink>
              </li>
            </ul>

            <div className="main-nav__controls">
              <SmartLink to={ctaUrl} className="nav-cta nav-cta--inline">
                {navLabel('tryMuaythai')}
              </SmartLink>
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
