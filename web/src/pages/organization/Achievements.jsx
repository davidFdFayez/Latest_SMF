import { Fragment, useEffect, useState } from 'react';
import { useLang } from '../../context/LanguageContext';
import { fetchResultsStats } from '../../api/services';
import Avatar from '../../components/Avatar';
import { usePageContent, useText } from '../../content/useContent';

/**
 * CNT-01 — every athlete card on this page carried a stock photo of a different
 * person; the Ali Alnasser card was an event graphic showing two other athletes
 * with their names burned into the image. All six have been withdrawn to
 * web/_withdrawn-athlete-photos/ and the cards render a neutral silhouette
 * until the federation supplies a licensed photograph of the athlete named.
 *
 * To restore a real photo: upload it as that athlete's photo in the admin
 * console (Achievements › National team champions). Never point one of these
 * at a photo of anyone else.
 */
const ATHLETE_PLACEHOLDER = '/assets/images/athlete-placeholder.svg';

/*
 * TODO(TXT-17) — Awaiting client data.
 *
 * QA reported errors in the athlete names, their photographs, and the
 * championship names on this page. The federation is supplying a data file with
 * the correct values; nothing on this page should be guessed or "corrected" from
 * memory until it arrives.
 *
 * Blocked on: SMF data file (athlete names, photos, championship names).
 * Affects: the champions, international achievements and Saudi Games content
 * (defaults in backend/Smf.Api/Data/Content/organization-achievements.json) — and
 * the withdrawn photographs described in web/_withdrawn-athlete-photos/README.md.
 */

/* Athlete row labels take these colours by position, in turn. */
const ROW_LABEL_MODS = ['amber', 'green'];

function AthleteCard({ a, ar, tx }) {
  const name = tx(a.name);
  return (
    <article className="athlete-card smf-reveal">
      <div className="athlete-card__photo">
        {tx(a.tag) && <span className="athlete-card__medal-tag">{tx(a.tag)}</span>}
        <Avatar
          variant="gold"
          name={
            a.photo === ATHLETE_PLACEHOLDER
              ? ar ? `${name} — الصورة قيد الإعداد` : `${name} — photo pending`
              : name
          }
          src={a.photo}
        />
      </div>
      <div className="athlete-card__body">
        {tx(a.category) && <p className="athlete-card__category">{tx(a.category)}</p>}
        <h3 className="athlete-card__name">{name}</h3>
        {tx(a.detail) && <p className="athlete-card__detail">{tx(a.detail)}</p>}
        {a.achievements?.length > 0 && (
          <p className="athlete-card__achievement">
            {a.achievements.map((line, i) => (
              <span key={`${i}-${line.text?.en ?? ''}`}>
                {i > 0 && <br />}
                {tx(line.text)}
              </span>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}

export default function Achievements() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('organization-achievements');
  const tx = useText();
  const [stats, setStats] = useState({ gold: 7, silver: 17, bronze: 48, total: 72, championships: 15 });

  useEffect(() => {
    fetchResultsStats().then((d) => { if (d) setStats(d); });
  }, []);

  if (!c) return fallback;

  const medals = [
    { mod: 'gold', icon: '🥇', count: stats.gold, label: c.medals.goldLabel },
    { mod: 'silver', icon: '🥈', count: stats.silver, label: c.medals.silverLabel },
    { mod: 'bronze', icon: '🥉', count: stats.bronze, label: c.medals.bronzeLabel },
  ];

  return (
    <>
      <section className="page-hero">
        <div className="page-hero__bg" />
        <div className="page-hero__overlay" aria-hidden="true" />
        <div className="page-hero__accent" aria-hidden="true" />
        <div className="container page-hero__content">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <a href="/">{ar ? 'الرئيسية' : 'Home'}</a>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <a href="/organization/overview">{ar ? 'الاتحاد' : 'The Organization'}</a>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الإنجازات' : 'Achievements'}</span>
          </nav>
          {tx(c.hero.tag) && (
            <span className="page-hero__tag">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="8" r="6" />
                <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
              </svg>
              {tx(c.hero.tag)}
            </span>
          )}
          <h1>{tx(c.hero.title)}</h1>
          {tx(c.hero.subtitle) && <p className="page-hero__sub">{tx(c.hero.subtitle)}</p>}
          <div className="page-hero__stats">
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">{stats.gold}</span>
              <span className="page-hero__stat-label">{tx(c.hero.goldsLabel)}</span>
            </div>
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">{stats.total}</span>
              <span className="page-hero__stat-label">{tx(c.hero.medalsLabel)}</span>
            </div>
            <div className="page-hero__stat">
              <span className="page-hero__stat-value">{stats.championships ?? 15}</span>
              <span className="page-hero__stat-label">{tx(c.hero.championshipsLabel)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="medal-hero">
        <div className="container">
          <div className="medal-hero__inner">
            <div>
              {tx(c.medals.label) && <span className="medal-hero__label">{tx(c.medals.label)}</span>}
              <h2 className="medal-hero__title">{tx(c.medals.title)}</h2>
              {tx(c.medals.subtitle) && <p className="medal-hero__sub">{tx(c.medals.subtitle)}</p>}
            </div>
            <div className="medal-row">
              {medals.map((m) => (
                <div className={`medal-item medal-item--${m.mod}`} key={m.mod}>
                  <span className="medal-item__icon">{m.icon}</span>
                  <span className="medal-item__count kpi-counter">{m.count}</span>
                  <span className="medal-item__label">{tx(m.label)}</span>
                  {c.medals.period && <span className="medal-item__period">{c.medals.period}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--amber">{tx(c.champions.label)}</span>
            <h2>{tx(c.champions.heading)}</h2>
            {tx(c.champions.intro) && <p>{tx(c.champions.intro)}</p>}
          </div>

          {c.champions.rows.map((row, r) => (
            <Fragment key={`${r}-${row.label?.en ?? ''}`}>
              <div className="athlete-spotlight__row-header">
                <span className={`section-label section-label--${ROW_LABEL_MODS[r % ROW_LABEL_MODS.length]}`}>{tx(row.label)}</span>
              </div>
              <div className="athlete-spotlight__grid">
                {(row.athletes ?? []).map((a, i) => (
                  <AthleteCard key={`${i}-${a.name?.en ?? ''}`} a={a} ar={ar} tx={tx} />
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.international.label)}</span>
            <h2>{tx(c.international.heading)}</h2>
          </div>

          {/* CNT-04 — two corrections live in these year blocks (defaults in
              organization-achievements.json); keep them when editing:
              - 2021: the Azzam Al Omary entry used to read "first individual
                international medal", which the 2019 Chungju bronzes disprove.
                It is the first IFMA *World Championship* medal for the men's squad.
              - 2019: the founding year was missing from the timeline entirely. */}
          {c.international.years.map((b, i) => (
            <div className={`achievement-year-block achievement-year-block--${b.style}`} key={`${i}-${b.year}`}>
              <span className="achievement-year-block__year-badge">{b.year}</span>
              <h3>{tx(b.title)}</h3>
              <div className="achievement-items">
                {(b.items ?? []).map((it, j) => (
                  <div className="achievement-item" key={`${j}-${it.text?.en ?? ''}`}>
                    <span className="achievement-item__icon">{it.icon}</span>
                    <span>{tx(it.text)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--amber">{tx(c.saudiGames.label)}</span>
            <h2>{tx(c.saudiGames.heading)}</h2>
            {tx(c.saudiGames.intro) && <p>{tx(c.saudiGames.intro)}</p>}
          </div>

          <div className="saudi-games-grid">
            {c.saudiGames.editions.map((g, i) => (
              <div className="saudi-games-card" key={`${i}-${g.edition?.en ?? ''}`}>
                <div className="saudi-games-card__header">
                  <span className="saudi-games-card__header-icon">🏆</span>
                  <div>
                    <div className="saudi-games-card__edition">{tx(g.edition)}</div>
                  </div>
                </div>
                <div className="saudi-games-card__body">
                  {(g.medalists ?? []).map((m, j) => (
                    <div className="saudi-games-card__medalist" key={`${j}-${m.name?.en ?? ''}`}>
                      <span className="saudi-games-card__medalist-icon">🥇</span>
                      {tx(m.name)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {(tx(c.saudiGames.highlightTitle) || tx(c.saudiGames.highlightBody)) && (
            <div className="achievement-highlight-box">
              <div className="achievement-highlight-box__header">
                <span className="achievement-highlight-box__icon">🏟️</span>
                <h3>{tx(c.saudiGames.highlightTitle)}</h3>
              </div>
              <p>{tx(c.saudiGames.highlightBody)}</p>
            </div>
          )}
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="milestones-grid">
            <div>
              <div className="section-header">
                <span className="section-label section-label--green">{tx(c.development.label)}</span>
                <h2>{tx(c.development.heading)}</h2>
              </div>
              <div className="achievement-year-block achievement-year-block--institutional">
                {c.development.badge && <span className="achievement-year-block__year-badge">{c.development.badge}</span>}
                <div className="achievement-items">
                  {c.development.items.map((d, i) => (
                    <div className="achievement-item" key={`${i}-${d.text?.en ?? ''}`}>
                      <span className="achievement-item__icon">{d.icon}</span>
                      <span>{tx(d.text)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="section-header">
                <span className="section-label section-label--green">{tx(c.institutional.label)}</span>
                <h2>{tx(c.institutional.heading)}</h2>
              </div>
              <ol className="timeline">
                {c.institutional.items.map((m, i) => (
                  <li className="timeline__item" key={`${i}-${m.text?.en ?? ''}`}>
                    <div className="timeline__year">{m.year}</div>
                    <div className="timeline__dot" aria-hidden="true" />
                    <div className="timeline__content">
                      <p>{tx(m.text)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
