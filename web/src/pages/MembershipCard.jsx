import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import { formatDate } from '../utils/format';

/**
 * A member's own membership card — tracker ISSUE-03.
 *
 * The profile in the console answers "who is this?" for a reviewer. This
 * answers it for everyone else: the member who wants proof of registration,
 * and the official on a competition door deciding whether to let them through.
 * One unguessable link, a QR code to scan it with, and an answer in a word:
 * valid, expired, or suspended.
 *
 * No sign-in, because a card you have to log in to show is not a card. The
 * page deliberately carries nothing that would matter if the link were passed
 * on — no identity number, no phone, no email, no date of birth.
 */

const TYPE_LABELS = {
  athlete: { ar: 'لاعب', en: 'Athlete' },
  coach: { ar: 'مدرب', en: 'Coach' },
  official: { ar: 'حكم', en: 'Referee' },
  club: { ar: 'نادي / منشأة', en: 'Club / facility' },
};

const GRADES = {
  entry: { ar: 'مستجد', en: 'Entry level' },
  third: { ar: 'درجة ثالثة', en: 'Third grade' },
  second: { ar: 'درجة ثانية', en: 'Second grade' },
  first: { ar: 'درجة أولى', en: 'First grade' },
  international: { ar: 'دولي', en: 'International' },
};

/** Two initials, for a card with no photo on file. */
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  return parts.slice(0, 2).map((part) => part[0]).join('');
}

export default function MembershipCard() {
  const { token } = useParams();
  const { lang } = useLang();
  const ar = lang === 'ar';

  const [state, setState] = useState({ loading: true, card: null, missing: false });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, card: null, missing: false });

    fetch(`/api/membership-card/${encodeURIComponent(token)}`)
      .then((response) => {
        if (!response.ok) throw new Error('not found');
        return response.json();
      })
      .then((card) => !cancelled && setState({ loading: false, card, missing: false }))
      .catch(() => !cancelled && setState({ loading: false, card: null, missing: true }));

    return () => {
      cancelled = true;
    };
  }, [token]);

  // A card is for whoever holds the link, not for a search engine.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (state.loading) {
    return (
      <section className="mcard-page">
        <p className="mcard-page__status">{ar ? 'جارٍ التحقق…' : 'Checking…'}</p>
      </section>
    );
  }

  if (state.missing) {
    return (
      <section className="mcard-page">
        <div className="mcard mcard--unknown">
          <span className="mcard__badge mcard__badge--unknown">{ar ? 'غير معروفة' : 'Not recognised'}</span>
          <h1 className="mcard__title">{ar ? 'لا توجد بطاقة بهذا الرابط' : 'No card at this link'}</h1>
          <p className="mcard__note">
            {ar
              ? 'قد يكون الرابط غير صحيح أو تم إصدار رابط جديد بدلاً منه. يرجى مراجعة الاتحاد.'
              : 'The link may be wrong, or a new one may have been issued in its place. Please check with the federation.'}
          </p>
        </div>
      </section>
    );
  }

  const card = state.card;
  const name = (ar ? card.nameAr : card.nameEn) || card.nameEn || card.nameAr || '';
  const other = (ar ? card.nameEn : card.nameAr) || '';
  const type = TYPE_LABELS[card.type] || { ar: card.type, en: card.type };
  const licence = ar ? card.licenceAr : card.licenceEn;
  const grade = card.refereeGrade ? GRADES[card.refereeGrade] : null;

  return (
    <section className="mcard-page">
      <article className={`mcard mcard--${card.status}`}>
        <header className="mcard__head">
          <img className="mcard__crest" src="/assets/images/logo.png" alt="" />
          <div>
            <p className="mcard__org">
              {ar ? 'الاتحاد السعودي للملاكمة التايلندية' : 'Saudi Muaythai Federation'}
            </p>
            <p className="mcard__kind">{ar ? type.ar : type.en}</p>
          </div>
          <span className={`mcard__badge mcard__badge--${card.status}`}>
            {ar ? card.statusAr : card.statusEn}
          </span>
        </header>

        <div className="mcard__body">
          <div className="mcard__photo">
            {card.hasPhoto ? (
              <img src={`/api/membership-card/${encodeURIComponent(token)}/photo`} alt="" />
            ) : (
              <span className="mcard__initials" aria-hidden="true">{initialsOf(name)}</span>
            )}
          </div>

          <div className="mcard__who">
            <h1 className="mcard__name">{name}</h1>
            {other && <p className="mcard__name-alt"><bdi>{other}</bdi></p>}
            {licence && <p className="mcard__licence">{licence}</p>}

            <dl className="mcard__facts">
              {card.membershipNumber && (
                <div>
                  <dt>{ar ? 'رقم العضوية' : 'Membership number'}</dt>
                  <dd><code>{card.membershipNumber}</code></dd>
                </div>
              )}
              {card.competitionCategory && (
                <div>
                  <dt>{ar ? 'الفئة التنافسية' : 'Competition category'}</dt>
                  <dd>{ar ? card.competitionCategory.ar : card.competitionCategory.en}</dd>
                </div>
              )}
              {grade && (
                <div>
                  <dt>{ar ? 'تصنيف الحكم' : 'Referee grade'}</dt>
                  <dd>{ar ? grade.ar : grade.en}</dd>
                </div>
              )}
              {card.region && (
                <div>
                  <dt>{ar ? 'المنطقة' : 'Region'}</dt>
                  <dd>{card.region}</dd>
                </div>
              )}
              <div>
                <dt>{ar ? 'سارية حتى' : 'Valid until'}</dt>
                <dd>
                  {card.validUntil ? formatDate(card.validUntil, lang) : '—'}
                  {card.status === 'valid' && typeof card.daysRemaining === 'number' && (
                    <span className="mcard__days">
                      {' · '}
                      {ar ? `${card.daysRemaining} يوماً متبقياً` : `${card.daysRemaining} days left`}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mcard__qr">
            <img src={`/api/membership-card/${encodeURIComponent(token)}/qr.svg`} alt="" />
            <span>{ar ? 'امسح للتحقق' : 'Scan to verify'}</span>
          </div>
        </div>

        <footer className="mcard__foot">
          <p>
            {ar
              ? 'هذه البطاقة تُعرض مباشرة من سجل الاتحاد، وتعكس حالة العضوية لحظة فتح الصفحة.'
              : 'This card is served from the federation’s own register and reflects the membership at the moment the page was opened.'}
          </p>
          <p className="mcard__checked">
            {ar ? 'تم التحقق: ' : 'Checked: '}
            {formatDate(card.checkedAt, lang)}
            {card.referenceNumber ? ` · ${card.referenceNumber}` : ''}
          </p>
          <button type="button" className="btn btn--outline mcard__print" onClick={() => window.print()}>
            {ar ? 'طباعة' : 'Print'}
          </button>
        </footer>
      </article>
    </section>
  );
}
