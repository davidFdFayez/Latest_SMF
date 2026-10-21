import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import { fetchNews, fetchEvents, fetchResultsStats } from '../api/services';
import { formatDate, formatDateRange } from '../utils/format';
import { SmartLink, usePageContent, useText } from '../content/useContent';
import { useSiteContent } from '../content/site';

const ico = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/* One icon per key figure, by position; extra figures reuse them in turn. */
const KPI_ICONS = [
  <svg key="athletes" className="kpi-card-v3__icon" {...ico} strokeWidth="1.4" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  <svg key="clubs" className="kpi-card-v3__icon" {...ico} strokeWidth="1.4" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  <svg key="coaches" className="kpi-card-v3__icon" {...ico} strokeWidth="1.4" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>,
  <svg key="medals" className="kpi-card-v3__icon" {...ico} strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" /></svg>,
  <svg key="events" className="kpi-card-v3__icon" {...ico} strokeWidth="1.4" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0012 0V2z" /></svg>,
];

/* The closing "Member Since" card. */
const MEMBER_SINCE_ICON = (
  <svg className="kpi-card-v3__icon" {...ico} strokeWidth="1.4" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
);

const ABOUT_ICONS = [
  <svg key="info" width="24" height="24" {...ico} strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
  <svg key="eye" width="24" height="24" {...ico} strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
  <svg key="pulse" width="24" height="24" {...ico} strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  <svg key="shield" width="24" height="24" {...ico} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
];

const REG_ICONS = [
  <svg key="athlete" {...ico} strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  <svg key="club" {...ico} strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  <svg key="coach" {...ico} strokeWidth="1.8"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>,
  <svg key="official" {...ico} strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
];

/** Neutral stand-in for a named athlete whose licensed photo is still pending. */
const ATHLETE_PLACEHOLDER = '/assets/images/athlete-placeholder.svg';

const ArrowIcon = () => (
  <svg width="16" height="16" {...ico} strokeWidth="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
);

const CATEGORY_FILTERS = [
  { key: 'all', ar: 'الكل', en: 'All' },
  { key: 'community', ar: 'فعاليات مجتمعية', en: 'Community Events' },
  { key: 'regional', ar: 'بطولات داخلية', en: 'Regional Championships' },
  { key: 'international', ar: 'بطولات دولية', en: 'International Championships' },
  { key: 'camp', ar: 'معسكرات تدريبية', en: 'Training Camps' },
  { key: 'workshop', ar: 'تدريب', en: 'Workshops & Education' },
];

const FALLBACK_EVENTS = [
  { id: 2, category: 'workshop', titleAr: 'ورشة تدريب المدربين', titleEn: 'Coaching Workshop', startDate: '2026-08-23', endDate: '2026-08-29', locationAr: 'المملكة، المملكة العربية السعودية', locationEn: 'Saudi Arabia, Saudi Arabia', status: 'confirmed' },
  { id: 3, category: 'workshop', titleAr: 'ورشة الحكام', titleEn: 'Referee Workshop', startDate: '2026-08-23', endDate: '2026-08-29', locationAr: 'المملكة، المملكة العربية السعودية', locationEn: 'Saudi Arabia, Saudi Arabia', status: 'confirmed' },
  { id: 4, category: 'regional', titleAr: 'بطولة خبر داخلية', titleEn: 'Khobar Regional Championship', startDate: '2026-08-26', endDate: '2026-08-29', locationAr: 'الخبر، المملكة العربية السعودية', locationEn: 'Khobar, Saudi Arabia', status: 'confirmed' },
  { id: 5, category: 'international', titleAr: 'بطولة العالم للكبار IFMA — كوسوفو', titleEn: 'IFMA Senior World Championship', startDate: '2026-09-01', endDate: '2026-09-11', locationAr: 'بريشتينا، كوسوفو', locationEn: 'Pristina, Kosovo', status: 'confirmed' },
  { id: 6, category: 'community', titleAr: 'فعالية اليوم الوطني السعودي', titleEn: 'Saudi National Day Event', startDate: '2026-09-20', endDate: '2026-09-26', locationAr: 'المملكة، المملكة العربية السعودية', locationEn: 'Saudi Arabia, Saudi Arabia', status: 'confirmed' },
  { id: 7, category: 'workshop', titleAr: 'ورشة بادماستر', titleEn: 'Pad Master Workshop', startDate: '2026-10-01', endDate: '2026-10-01', locationAr: 'المملكة، المملكة العربية السعودية', locationEn: 'Saudi Arabia, Saudi Arabia', status: 'tentative' },
];

export default function Home() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('home');
  const { site } = useSiteContent();
  const tx = useText();
  const [filter, setFilter] = useState('all');
  const [events, setEvents] = useState(FALLBACK_EVENTS);
  const [news, setNews] = useState([]);
  const [stats, setStats] = useState({ total: 72 });

  useEffect(() => {
    fetchEvents().then((data) => {
      if (!data?.length) return;
      const upcoming = data.filter((e) => e.status !== 'completed');
      setEvents(upcoming.length ? upcoming.slice(0, 8) : data.slice(0, 8));
    });
    fetchNews({ pageSize: 3 }).then((data) => { if (data?.length) setNews(data); });
    fetchResultsStats().then((data) => { if (data) setStats(data); });
  }, []);

  const filtered = filter === 'all' ? events : events.filter((e) => e.category === filter);

  if (!c) return fallback;

  // Phone, WhatsApp, email, community link, QR codes and supervising bodies
  // live in site-wide content; this page only labels them.
  const contact = site?.contact ?? {};
  const qrCodes = site?.qrCodes ?? {};
  const heroTitleStart = tx(c.hero.titleStart);
  const heroTitleHighlight = tx(c.hero.titleHighlight);

  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="hero__bg" />
        <div className="hero__overlay" aria-hidden="true" />
        <div className="hero__slant" aria-hidden="true" />
        <div className="container">
          <div className="hero__content">
            <h1 className="hero__title">
              {heroTitleStart}
              {heroTitleStart && heroTitleHighlight ? ' ' : ''}
              {heroTitleHighlight && <span className="highlight">{heroTitleHighlight}</span>}
            </h1>
            <p className="hero__subtitle">{tx(c.hero.subtitle)}</p>
            <div className="hero__ctas">
              {c.hero.primaryUrl && (
                <SmartLink to={c.hero.primaryUrl} className="btn btn--primary">
                  <svg width="18" height="18" {...ico} strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {tx(c.hero.primaryLabel)}
                </SmartLink>
              )}
              {c.hero.secondaryUrl && (
                <SmartLink to={c.hero.secondaryUrl} className="btn btn--secondary">{tx(c.hero.secondaryLabel)}</SmartLink>
              )}
              {c.hero.tertiaryUrl && (
                <SmartLink to={c.hero.tertiaryUrl} className="btn btn--outline btn--outline-white">{tx(c.hero.tertiaryLabel)}</SmartLink>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* RECOGNITION */}
      <section className="recognition">
        <div className="container recognition__inner">
          <p className="recognition__label">{tx(c.recognition.label)}</p>
          <div className="recognition__logos">
            {(site?.partners ?? []).map((p, i) => (
              <div className="recognition__logo-item" key={`${i}-${p.logo}`}>
                <img src={p.logo} alt={tx(p.name)} loading="lazy" />
                <span>{tx(p.name)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="kpi-section-v3">
        <div className="container">
          <div className="kpi-grid-v3" role="list">
            {c.kpis.items.map((k, i) => {
              // "medals" figures show the international medal total from the results API.
              const count = k.source === 'medals' ? String(stats.total ?? 72) : String(k.value ?? '');
              const plus = count.endsWith('+');
              const value = plus ? count.slice(0, -1) : count;
              return (
                <div className="kpi-card-v3" role="listitem" key={`${i}-${k.label?.en}`}>
                  {KPI_ICONS[i % KPI_ICONS.length]}
                  <div className="kpi-card-v3__num">
                    <span className="kpi-counter">{value}</span>
                    {plus && <span className="ks">+</span>}
                  </div>
                  <div className="kpi-card-v3__lbl">{tx(k.label)}</div>
                </div>
              );
            })}
            <div className="kpi-card-v3" role="listitem">
              {MEMBER_SINCE_ICON}
              <div className="kpi-card-v3__num kpi-card-v3__num--year">
                <span className="ky-label">{tx(c.kpis.memberSinceLabel)}</span>
                {c.kpis.memberSinceYear}
              </div>
              <div className="kpi-card-v3__lbl">{tx(c.kpis.memberSinceCaption)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section className="about-section section">
        <div className="container">
          <div className="about-section__intro about-section-v2__intro">
            <div className="about-section__text">
              <p className="text-green font-bold hp-eyebrow">{tx(c.about.eyebrow)}</p>
              <h2>{tx(c.about.heading)}</h2>
              <p>{tx(c.about.text)}</p>
              {c.about.buttonUrl && (
                <div className="about-section__cta">
                  <SmartLink to={c.about.buttonUrl} className="btn btn--green">
                    {tx(c.about.buttonLabel)}
                    <ArrowIcon />
                  </SmartLink>
                </div>
              )}
            </div>
            {c.about.photo && (
              <div className="about-section-v2__photo">
                <img src={c.about.photo} alt={ar ? 'مواي تاي سعودي' : 'Saudi Muaythai'} loading="lazy" />
              </div>
            )}
          </div>

          <div className="about-cards" role="list">
            {c.about.cards.map((card, i) => (
              <article className="about-card" role="listitem" key={`${i}-${card.title?.en}`}>
                <div className="about-card__icon" aria-hidden="true">{ABOUT_ICONS[i % ABOUT_ICONS.length]}</div>
                <h3>{tx(card.title)}</h3>
                <p>{tx(card.body)}</p>
                {card.url && (
                  <SmartLink to={card.url} className="about-card__link">
                    {tx(c.about.cardLinkLabel)}
                    <ArrowIcon />
                  </SmartLink>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* NATIONAL TEAM */}
      <section className="national-team">
        <div className="container national-team__inner">
          <div className="national-team__header smf-reveal">
            <span className="section-label section-label--amber">{tx(c.nationalTeam.label)}</span>
            <h2 className="nat-team-h2">{tx(c.nationalTeam.heading)}</h2>
            <p>{tx(c.nationalTeam.text)}</p>
          </div>
          <div className="national-team__grid smf-reveal">
            {/* CNT-01 — every card here carried a stock photo of a different
                person, one of them an event graphic with two other athletes'
                names burned into it. Until the federation supplies a licensed
                photograph of the athlete a card names, the card shows a neutral
                silhouette; the originals are in web/_withdrawn-athlete-photos/.
                Set the athlete's photo (home content) back to a real file once
                one exists. */}
            {c.nationalTeam.athletes.map((p, i) => {
              const img = p.photo || ATHLETE_PLACEHOLDER;
              const name = tx(p.name);
              return (
                <article className="nat-athlete-card" key={`${i}-${p.name?.en}`}>
                  <div className="nat-athlete-card__photo">
                    <img
                      src={img}
                      alt={
                        img === ATHLETE_PLACEHOLDER
                          ? ar ? `${name} — الصورة قيد الإعداد` : `${name} — photo pending`
                          : name
                      }
                      loading="lazy"
                    />
                  </div>
                  <h3 className="nat-athlete-card__name">{name}</h3>
                </article>
              );
            })}
          </div>
          {(c.nationalTeam.primaryUrl || c.nationalTeam.secondaryUrl) && (
            <div className="national-team__cta smf-reveal">
              {c.nationalTeam.primaryUrl && (
                <SmartLink to={c.nationalTeam.primaryUrl} className="btn btn--primary">
                  {tx(c.nationalTeam.primaryLabel)}
                  <ArrowIcon />
                </SmartLink>
              )}
              {c.nationalTeam.secondaryUrl && (
                <SmartLink to={c.nationalTeam.secondaryUrl} className="btn btn--outline btn--ghost-white">
                  {tx(c.nationalTeam.secondaryLabel)}
                </SmartLink>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ACTIVITIES */}
      <section className="activities-section">
        <div className="container">
          <header className="section__header">
            <p className="text-amber font-bold hp-eyebrow">{tx(c.activities.eyebrow)}</p>
            <h2>{tx(c.activities.heading)}</h2>
            <p>{tx(c.activities.text)}</p>
          </header>

          <div className="hp-cal-filters">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat.key}
                type="button"
                className={`hp-cal-filter${filter === cat.key ? ' active' : ''}${cat.key !== 'all' ? ` cat--${cat.key}` : ''}`}
                onClick={() => setFilter(cat.key)}
              >
                {cat.key !== 'all' && <span className="hp-cal-filter__dot" />}
                {ar ? cat.ar : cat.en}
              </button>
            ))}
          </div>

          <div className="hp-events-grid">
            {filtered.map((ev) => (
              <article className={`hp-event-card cat--${ev.category}`} key={ev.id}>
                <div className="hp-event-card__stripe" />
                <div className="hp-event-card__body">
                  <div className="hp-event-card__badge">
                    {CATEGORY_FILTERS.find((cat) => cat.key === ev.category)?.[ar ? 'ar' : 'en'] || ev.category}
                  </div>
                  <h3 className="hp-event-card__title">{ar ? ev.titleAr || ev.title : ev.titleEn || ev.title}</h3>
                  <div className="hp-event-card__meta">
                    <div className="hp-event-card__date">{formatDateRange(ev.startDate, ev.endDate, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    <div className="hp-event-card__loc">{ar ? ev.locationAr || ev.location : ev.locationEn || ev.location}</div>
                    {ev.status === 'tentative' && (
                      <div className="hp-event-card__tentative">{ar ? 'مبدئي' : 'Tentative'}</div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {filtered.length === 0 && (
            <div>{ar ? 'لا توجد فعاليات لهذه الفئة' : 'No events in this category'}</div>
          )}

          <div className="activities-section__cta">
            <Link to="/activities/calendar" className="btn btn--primary">
              {tx(c.activities.calendarButtonLabel)}
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      {/* NEWS */}
      <section className="hp-news-section section" id="news">
        <div className="container">
          <header className="section__header">
            <p className="text-green font-bold hp-eyebrow">{tx(c.news.eyebrow)}</p>
            <h2>{tx(c.news.heading)}</h2>
          </header>

          <div className="news-grid">
            {news.map((n) => {
              const isIfma = n.source === 'IFMA' || !!n.externalUrl;
              const title = n.title || (ar ? n.titleAr : n.titleEn);
              const summary = n.summary || (ar ? n.summaryAr : n.summaryEn);
              const href = isIfma ? n.externalUrl : `/news/${n.id}`;
              const catLabel = isIfma
                ? 'IFMA'
                : n.category === 'events'
                  ? (ar ? 'الفعاليات والمنافسات' : 'Events & Competitions')
                  : (ar ? 'أخبار الاتحاد' : 'Federation News');

              // Extra props are forwarded so the image link can opt out of the
              // accessibility tree — see below.
              const TitleLink = isIfma
                ? ({ children, className, ...rest }) => <a className={className} href={href} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
                : ({ children, className, ...rest }) => <Link className={className} to={href} {...rest}>{children}</Link>;

              return (
                <article className={`news-card${isIfma ? ' ifma-card' : ''}`} key={n.id || n.externalUrl}>
                  {/* P8 — the card already links to the article twice, from the
                      headline and from "read more". This third link wraps a
                      decorative image (alt=""), so it has no accessible name of
                      its own and would be announced as an empty link. Keeping it
                      clickable by mouse while hiding it from assistive tech and
                      the tab order gives one link per card instead of three. */}
                  {n.imageUrl && (
                    <TitleLink className="news-card__img-link" aria-hidden="true" tabIndex={-1}>
                      {/* The editor's focal point, so the crop keeps the subject. */}
                      <img
                        className="news-card__img"
                        src={n.imageUrl}
                        alt=""
                        loading="lazy"
                        style={n.imageFocus ? { objectPosition: n.imageFocus } : undefined}
                      />
                    </TitleLink>
                  )}
                  <div className="news-card__body">
                    <div className="news-card__meta">
                      <span className={`news-card__cat${isIfma ? ' ifma-card__source' : ''}`}>{catLabel}</span>
                      <time className="news-card__date">{formatDate(n.publishedAt, lang)}</time>
                    </div>
                    <h3 className="news-card__title">
                      <TitleLink className="news-card__title-link">{title}</TitleLink>
                    </h3>
                    <p className="news-card__excerpt">{summary}</p>
                    <TitleLink className="news-card__read-more">
                      {isIfma ? (ar ? 'اقرأ على موقع IFMA' : 'Read on IFMA') : (ar ? 'اقرأ المزيد' : 'Read more')}
                    </TitleLink>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="activities-section__cta">
            <Link to="/news" className="btn btn--primary">
              {tx(c.news.viewAllLabel)}
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      {/* REGISTRATION */}
      <section className="registration-section section">
        <div className="container">
          <header className="section__header">
            <p className="text-green font-bold hp-eyebrow">{tx(c.registration.eyebrow)}</p>
            <h2>{tx(c.registration.heading)}</h2>
          </header>

          {tx(c.registration.note) && (
            <div className="registration-note" role="note">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
              </svg>
              <span>{tx(c.registration.note)}</span>
            </div>
          )}

          <div className="reg-cards" role="list">
            {c.registration.cards.map((r, i) => (
              <article className="reg-card" role="listitem" key={`${i}-${r.url}`}>
                <div className="reg-card__icon" aria-hidden="true">{REG_ICONS[i % REG_ICONS.length]}</div>
                <h3>{tx(r.title)}</h3>
                <p>{tx(r.description)}</p>
                {r.url && (
                  <SmartLink to={r.url} className="btn btn--green">{tx(c.registration.buttonLabel)}</SmartLink>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* WHISTLEBLOWER */}
      <section className="section--green-gradient">
        <div className="container wb-container">
          <div className="wb-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DE0023" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="wb-heading">{tx(c.whistleblower.heading)}</h2>
          <p className="wb-lead">{tx(c.whistleblower.lead)}</p>
          {tx(c.whistleblower.sub) && <p className="wb-sub">{tx(c.whistleblower.sub)}</p>}
          {c.whistleblower.buttonUrl && (
            <SmartLink to={c.whistleblower.buttonUrl} className="btn btn--primary">{tx(c.whistleblower.buttonLabel)}</SmartLink>
          )}
        </div>
      </section>

      {/* CONTACT */}
      <section className="hp-contact section--lg">
        <div className="container">
          <div className="section-label text-amber">{tx(c.contact.label)}</div>
          <h2 className="section-title">{tx(c.contact.heading)}</h2>
          <p className="section-sub">{tx(c.contact.text)}</p>

          <div className="hp-contact__grid">
            {contact.phoneDisplay && (
              <a className="hp-contact__card" href={`tel:${contact.phoneLink || contact.phoneDisplay}`}>
                <div className="hp-contact__icon hp-contact__icon--phone" aria-hidden="true">
                  <svg {...ico} strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.1 1.22 2 2 0 012.1 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
                </div>
                <div className="hp-contact__info">
                  <span className="hp-contact__label">{tx(c.contact.phoneLabel)}</span>
                  <span className="hp-contact__value" dir="ltr">{contact.phoneDisplay}</span>
                </div>
              </a>
            )}

            {contact.whatsappUrl && (
              <a className="hp-contact__card hp-contact__card--wa" href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer">
                <div className="hp-contact__icon hp-contact__icon--wa" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                </div>
                <div className="hp-contact__info">
                  <span className="hp-contact__label">{tx(c.contact.whatsappLabel)}</span>
                  <span className="hp-contact__value" dir="ltr">{contact.phoneDisplay}</span>
                </div>
              </a>
            )}

            {contact.email && (
              <a className="hp-contact__card" href={`mailto:${contact.email}`}>
                <div className="hp-contact__icon hp-contact__icon--email" aria-hidden="true">
                  <svg {...ico} strokeWidth="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                </div>
                <div className="hp-contact__info">
                  <span className="hp-contact__label">{tx(c.contact.emailLabel)}</span>
                  <span className="hp-contact__value">{contact.email}</span>
                </div>
              </a>
            )}

            {contact.whatsappCommunityUrl && (
              <a className="hp-contact__card hp-contact__card--community" href={contact.whatsappCommunityUrl} target="_blank" rel="noopener noreferrer">
                <div className="hp-contact__icon hp-contact__icon--community" aria-hidden="true">
                  <svg {...ico} strokeWidth="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                </div>
                <div className="hp-contact__info">
                  <span className="hp-contact__label">{tx(c.contact.communityLabel)}</span>
                  <span className="hp-contact__value">{tx(c.contact.communityValue)}</span>
                </div>
              </a>
            )}
          </div>

          <div className="hp-contact__qr-strip">
            {qrCodes.whatsapp && contact.whatsappUrl && (
              <div className="hp-contact__qr-block">
                <a
                  className="hp-contact__qr-placeholder"
                  href={contact.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    src={qrCodes.whatsapp}
                    alt={ar ? 'رمز QR للتواصل عبر واتساب' : 'QR code to message SMF on WhatsApp'}
                    loading="lazy"
                  />
                </a>
                <p className="hp-contact__qr-label">{tx(c.contact.whatsappQrCaption)}</p>
              </div>
            )}
            {qrCodes.community && contact.whatsappCommunityUrl && (
              <div className="hp-contact__qr-block">
                <a
                  className="hp-contact__qr-placeholder hp-contact__qr-placeholder--community"
                  href={contact.whatsappCommunityUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    src={qrCodes.community}
                    alt={ar ? 'رمز QR للانضمام إلى مجتمع الاتحاد' : 'QR code to join the SMF community'}
                    loading="lazy"
                  />
                </a>
                <p className="hp-contact__qr-label">{tx(c.contact.communityQrCaption)}</p>
              </div>
            )}
          </div>

          <Link to="/contact" className="btn btn--secondary btn--green-outline">{tx(c.contact.buttonLabel)}</Link>
        </div>
      </section>
    </>
  );
}
