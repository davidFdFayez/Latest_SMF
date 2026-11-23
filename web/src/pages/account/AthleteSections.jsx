import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchMedicalRequirements, messageOf, openMedicalDocument, saveMedical, uploadMedicalAttachment,
} from '../../api/member';
import { ACCEPTED_FILE_TYPES, MAX_FILE_BYTES, MAX_FILE_LABEL } from '../../data/registrationPortal';
import { compressImage } from '../../utils/compressImage';
import { formatDate, formatDateRange, toLatinDigits } from '../../utils/format';
import { IconCalendar, IconLocation } from '../../components/icons/Icons';
import {
  IconBuilding, IconGlove, IconMedal, IconMedicalFile, IconStats, IconTrend, IconTrophy,
} from '../../components/icons/AccountIcons';
import { Panel, ParticipationChart } from './AccountStatistics';
import { Empty, Pill, SectionTitle } from './clubParts';

/*
 * The athlete's own account, beyond what it shares with the club and coach:
 * a report on their own competition record, and the parts of their Sports
 * Profile that come from the system rather than from their registration —
 * the club they are linked to, their category this year, their results and
 * their ranking.
 *
 * Every figure comes from /api/member/athlete/record, which reads entries and
 * decided bouts only. Medals, placings and a ranking are recorded nowhere yet,
 * so they are shown as not recorded rather than worked out.
 */

const ENTRY_TONE = {
  registered: 'info',
  checked_in: 'info',
  qualified: 'ok',
  not_eligible: 'muted',
  disqualified: 'muted',
  withdrawn: 'muted',
};

const OUTCOME = {
  win: { tone: 'ok', ar: 'فوز', en: 'Win' },
  loss: { tone: 'muted', ar: 'خسارة', en: 'Loss' },
  walkover_win: { tone: 'ok', ar: 'فوز بانسحاب المنافس', en: 'Win by walkover' },
  bye: { tone: 'info', ar: 'تأهل دون نزال', en: 'Advanced on a bye' },
};

/* ── statistics ───────────────────────────────────────────────────────── */

export function AthleteStatistics({ record, ar, note }) {
  const title = ar ? 'الإحصائيات' : 'Statistics';

  if (!record) {
    return (
      <>
        <SectionTitle Icon={IconStats} title={title} note={note} />
        <p className="club-dash__loading">{ar ? 'جارٍ تحميل الإحصائيات…' : 'Loading statistics…'}</p>
      </>
    );
  }

  const { totals } = record;
  const summary = [
    { key: 'all', tone: 'gold', Icon: IconTrophy, value: totals.participations, label: ar ? 'إجمالي المشاركات في البطولات' : 'Tournament participations' },
    { key: 'current', tone: 'blue', Icon: IconCalendar, value: totals.current, label: ar ? 'مشاركات حالية' : 'Current participations' },
    { key: 'done', tone: 'green', Icon: IconMedal, value: totals.completed, label: ar ? 'مشاركات مكتملة' : 'Completed participations' },
  ];

  return (
    <>
      <SectionTitle Icon={IconStats} title={title} note={note} />

      <div className="club-stats__summary athlete-stats__summary">
        {summary.map(({ key, tone, Icon, label, value }) => (
          <div className={`club-kpi club-kpi--${tone}`} key={key}>
            <Icon className="club-kpi__icon" />
            <span className="club-kpi__label">{label}</span>
            <strong className="club-kpi__value">{toLatinDigits(value)}</strong>
          </div>
        ))}
      </div>

      <div className="club-stats__grid">
        <Panel title={ar ? 'مشاركاتي عبر السنوات' : 'My participation over the years'}>
          <ParticipationChart
            points={record.participation}
            ar={ar}
            emptyText={ar ? 'لم تشارك في أي بطولة بعد.' : 'You have not taken part in a tournament yet.'}
          />
        </Panel>
        <Panel title={ar ? 'نتائج النزالات' : 'Bout results'}>
          <BoutBalance totals={totals} ar={ar} />
        </Panel>
        <Panel title={ar ? 'حالة المشاركات' : 'Participation status'}>
          <EntryBreakdown totals={totals} ar={ar} />
        </Panel>
        <Panel title={ar ? 'الميداليات' : 'Medals'}>
          <Empty Icon={IconMedal} text={ar ? 'لا توجد ميداليات مسجلة حتى الآن.' : 'No medals recorded yet.'} />
        </Panel>
      </div>
    </>
  );
}

/** Wins against losses, as one split bar — only bouts actually fought and decided. */
function BoutBalance({ totals, ar }) {
  if (totals.boutsDecided === 0) {
    return (
      <Empty
        Icon={IconGlove}
        text={ar ? 'لا توجد نزالات محسومة مسجلة حتى الآن.' : 'No decided bouts recorded yet.'}
      />
    );
  }

  const winShare = (totals.wins / totals.boutsDecided) * 100;
  return (
    <div className="athlete-split">
      <div className="athlete-split__bar" role="img"
           aria-label={ar ? `فوز ${totals.wins}، خسارة ${totals.losses}` : `${totals.wins} won, ${totals.losses} lost`}>
        <span className="athlete-split__win" style={{ inlineSize: `${winShare}%` }} />
        <span className="athlete-split__loss" style={{ inlineSize: `${100 - winShare}%` }} />
      </div>
      <ul className="athlete-split__legend">
        <li><span className="athlete-split__dot is-win" />{ar ? 'فوز' : 'Won'}<strong>{toLatinDigits(totals.wins)}</strong></li>
        <li><span className="athlete-split__dot is-loss" />{ar ? 'خسارة' : 'Lost'}<strong>{toLatinDigits(totals.losses)}</strong></li>
      </ul>
    </div>
  );
}

/** Where each entry stands: still ahead, done, or withdrawn. */
function EntryBreakdown({ totals, ar }) {
  const parts = [
    { key: 'current', value: totals.current, label: ar ? 'حالية' : 'Current' },
    { key: 'completed', value: totals.completed, label: ar ? 'مكتملة' : 'Completed' },
    { key: 'withdrawn', value: totals.withdrawn, label: ar ? 'منسحب منها أو غير مؤهل' : 'Withdrawn or not eligible' },
  ];
  const total = parts.reduce((sum, part) => sum + part.value, 0);

  if (total === 0) {
    return <Empty Icon={IconTrophy} text={ar ? 'لا توجد مشاركات مسجلة بعد.' : 'No entries recorded yet.'} />;
  }

  return (
    <ul className="athlete-breakdown">
      {parts.map((part) => (
        <li key={part.key}>
          <span className="athlete-breakdown__label">{part.label}</span>
          <span className="athlete-breakdown__track">
            <span className={`athlete-breakdown__fill is-${part.key}`} style={{ inlineSize: `${(part.value / total) * 100}%` }} />
          </span>
          <strong>{toLatinDigits(part.value)}</strong>
        </li>
      ))}
    </ul>
  );
}

/* ── sports profile: what the system knows, beside what they registered ── */

/**
 * The official club link and this year's category. Both come from the system,
 * not from the registration answers: the club only once they accepted its
 * invitation, the category from their date of birth by the general rule.
 */
export function SportsStanding({ club, record, ar }) {
  const clubName = club ? (ar ? club.nameAr || club.nameEn : club.nameEn || club.nameAr) : '';
  const category = record?.category;

  return (
    <section className="club-panelset">
      <h3 className="club-panelset__title">
        <IconBuilding className="club-panelset__icon" />
        {ar ? 'النادي والفئة' : 'Club & category'}
      </h3>
      <dl className="club-cells">
        <div className="club-cell">
          <dt className="club-cell__label">{ar ? 'النادي المعتمد في النظام' : 'Official club in the system'}</dt>
          <dd className="club-cell__value">
            {clubName || <span className="club-cell__empty">{ar ? 'غير مرتبط بنادٍ' : 'Not linked to a club'}</span>}
          </dd>
        </div>
        <div className="club-cell">
          <dt className="club-cell__label">{ar ? 'الفئة' : 'Category'}</dt>
          <dd className="club-cell__value">
            {category ? (ar ? category.ar : category.en) : <span className="club-cell__empty">—</span>}
          </dd>
        </div>
      </dl>
      <p className="club-profile__hint">
        {ar
          ? 'الفئة العامة تُحسب من تاريخ الميلاد للعام الحالي. أهلية المشاركة في كل بطولة تُحدَّد عند التسجيل فيها وفق أنظمتها.'
          : "The general category follows from your date of birth for this year. Eligibility for each tournament is decided when you enter it, by that tournament's rules."}
      </p>
    </section>
  );
}

/** Every tournament they were entered in, newest first, with any decided bouts. */
export function ResultsPanel({ record, ar, lang }) {
  const entries = record?.entries;

  return (
    <section className="club-panelset athlete-results">
      <h3 className="club-panelset__title">
        <IconTrophy className="club-panelset__icon" />
        {ar ? 'النتائج' : 'Results'}
      </h3>

      {!record ? (
        <p className="club-dash__loading">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : entries.length === 0 ? (
        <Empty Icon={IconTrophy} text={ar ? 'لا توجد نتائج مسجلة حتى الآن' : 'No results recorded yet'} />
      ) : (
        <ol className="athlete-timeline">
          {entries.map((entry) => (
            <li className="athlete-timeline__item" key={entry.id}>
              <div className="athlete-timeline__head">
                <Link className="athlete-timeline__name" to={`/activities/event/tournament-${entry.tournamentId}`}>
                  {ar ? entry.tournamentNameAr : entry.tournamentNameEn}
                </Link>
                <Pill tone={ENTRY_TONE[entry.status] || 'info'}>{ar ? entry.statusAr : entry.statusEn}</Pill>
              </div>
              <span className="club-tournament__facts">
                <span><IconCalendar aria-hidden="true" />{formatDateRange(entry.startDate, entry.endDate, lang)}</span>
                {(entry.locationAr || entry.locationEn) && (
                  <span><IconLocation aria-hidden="true" />{ar ? entry.locationAr : entry.locationEn}</span>
                )}
              </span>
              {(entry.divisionAr || entry.divisionEn) && (
                <span className="athlete-timeline__division">{ar ? entry.divisionAr : entry.divisionEn}</span>
              )}

              {entry.bouts.some((bout) => bout.outcome) ? (
                <ul className="athlete-bouts">
                  {entry.bouts.filter((bout) => bout.outcome).map((bout) => {
                    const outcome = OUTCOME[bout.outcome];
                    const opponent = ar ? bout.opponentNameAr || bout.opponentNameEn : bout.opponentNameEn || bout.opponentNameAr;
                    return (
                      <li key={bout.id}>
                        <span className="athlete-bouts__round">{ar ? bout.roundAr : bout.roundEn}</span>
                        <span className="athlete-bouts__opponent">
                          {opponent ? (ar ? `ضد ${opponent}` : `vs ${opponent}`) : '—'}
                        </span>
                        {bout.scheduledDate && <span className="athlete-bouts__date">{formatDate(bout.scheduledDate, lang)}</span>}
                        <Pill tone={outcome.tone}>{ar ? outcome.ar : outcome.en}</Pill>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="athlete-timeline__none">
                  {ar ? 'لم تُسجَّل نتيجة لهذه المشاركة بعد.' : 'No result has been recorded for this entry yet.'}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The athlete's ranking: recorded nowhere yet, and never worked out here. */
export function RankingPanel({ ar }) {
  return (
    <section className="club-panelset">
      <h3 className="club-panelset__title">
        <IconTrend className="club-panelset__icon" />
        {ar ? 'التصنيف' : 'Ranking / Classification'}
      </h3>
      <Empty
        Icon={IconMedal}
        text={ar ? 'لم يتم تحديد تصنيف للاعب حتى الآن' : 'No athlete classification has been assigned yet'}
      />
    </section>
  );
}

/* ── medical file ─────────────────────────────────────────────────────── */

/** Which part of the athlete's file each document is, for saving. */
const DOCUMENT_FIELDS = {
  certificate: { id: 'certificateAttachmentId', date: 'certificateDate' },
  screening: { id: 'screeningAttachmentId', date: 'screeningDate' },
  guardian_consent: { id: 'guardianConsentAttachmentId', date: null, form: 'guardian_form' },
  // Girls under 18: the non-pregnancy declaration, its own signed document.
  pregnancy_declaration: { id: 'pregnancyDeclarationAttachmentId', date: null, form: 'pregnancy_form' },
};

/**
 * The athlete's Medical File: what the tournaments they are entered in still
 * need from them (REQ-04), read from the server and completed here.
 *
 * Not a standing questionnaire. With no tournament entry there is nothing to
 * ask, and the calm empty state shows. With entries:
 * <ul>
 *   <li>every document a tournament needs is listed, uploaded or not —
 *       "uploaded" is never "approved";</li>
 *   <li>a health question or declaration appears only while unanswered: one
 *       answered at registration, or here, does not come back.</li>
 * </ul>
 * Replacing a document already on file waits for approval; the one in use
 * stays in use until then, and the registration is not affected.
 *
 * With titled off, its own heading is left to the section heading above it.
 */
export function MedicalFilePanel({ ar, lang, titled = true }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => fetchMedicalRequirements()
    .then((result) => { setData(result); setError(''); })
    .catch((err) => setError(messageOf(err, lang, ar ? 'تعذر تحميل الملف الطبي.' : 'Could not load the Medical File.'))), [lang, ar]);

  useEffect(() => { load(); }, [load]);

  const empty = data && data.tournaments.length === 0;

  return (
    <section className="club-panelset athlete-medical">
      {titled && (
        <h3 className="club-panelset__title">
          <IconMedicalFile className="club-panelset__icon" />
          {ar ? 'الملف الطبي' : 'Medical File'}
        </h3>
      )}

      {error ? (
        <p className="club-dash__error" role="alert">{error}</p>
      ) : !data ? (
        <p className="club-dash__loading">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : empty ? (
        <div className="club-empty athlete-medical__empty">
          <IconMedicalFile className="club-empty__icon" />
          <strong>{ar ? 'لا توجد متطلبات طبية حالياً' : 'No medical requirements at the moment'}</strong>
          <p>
            {ar
              ? 'ستظهر هنا المتطلبات والمرفقات الطبية المطلوبة عند التسجيل في بطولة.'
              : 'Medical requirements and required attachments will appear here when you register for a tournament.'}
          </p>
        </div>
      ) : (
        <div className="athlete-medical__body">
          {data.hasPendingChange && (
            <p className="athlete-medical__pending" role="status">
              {ar
                ? 'لديك مستند بديل بانتظار اعتماد الجهة المختصة. يبقى المستند الحالي معتمدًا حتى ذلك الحين.'
                : 'A replacement document is waiting for approval. The current one stays in use until then.'}
            </p>
          )}

          {data.medicalLock && (
            <p className="athlete-medical__pending athlete-medical__locked" role="status">
              {ar
                ? `ملفك الطبي مقفل لحصولك على الاعتماد النهائي في: ${data.medicalLock.tournaments.map((x) => x.nameAr || x.nameEn).join('، ')}. يمكنك الاطلاع عليه فقط؛ للتعديل تواصل مع الاتحاد.`
                : `Your Medical File is locked because you have Final Approval in: ${data.medicalLock.tournaments.map((x) => x.nameEn || x.nameAr).join(', ')}. You can view it; to change it, contact the federation.`}
            </p>
          )}

          <ul className="athlete-medical__groups">
            {data.tournaments.map((group) => (
              <li className="athlete-medical__group" key={group.tournamentId}>
                <div className="athlete-medical__head">
                  <strong>{ar ? group.tournamentNameAr : group.tournamentNameEn}</strong>
                  <span>
                    {group.missingDocuments === 0
                      ? (ar ? 'المستندات مرفوعة' : 'Documents uploaded')
                      : (ar ? `${toLatinDigits(group.missingDocuments)} متطلبات متبقية` : `${group.missingDocuments} remaining`)}
                  </span>
                </div>
                <ul className="athlete-medical__items">
                  {group.documents.map((document) => (
                    <DocumentRow key={document.key} document={document} tournamentId={group.tournamentId}
                                 locked={Boolean(data.medicalLock)} ar={ar} lang={lang} onSaved={load} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {!data.medicalLock && data.questions.length > 0 && (
            <OutstandingQuestions questions={data.questions} ar={ar} lang={lang} onSaved={load} />
          )}

          {!data.medicalLock && (data.declarations.length > 0 || data.pregnancyDeclarationOutstanding) && (
            <OutstandingDeclarations data={data} ar={ar} lang={lang} onSaved={load} />
          )}

        </div>
      )}
    </section>
  );
}

/** One document a tournament needs: its state, and uploading, replacing or opening it. */
function DocumentRow({ document, tournamentId, locked = false, ar, lang, onSaved }) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // "approved": an authorised user approved the document in use (an
  // administrator's upload, or a replacement they accepted).
  const approved = document.status === 'approved';
  const uploaded = approved || document.status === 'uploaded';
  const fields = DOCUMENT_FIELDS[document.key];

  async function pick(picked) {
    if (!picked) return;
    setBusy(true);
    setError('');
    try {
      const file = await compressImage(picked);
      if (file.size > MAX_FILE_BYTES) throw new Error('size');
      const stored = await uploadMedicalAttachment(file);
      const body = { [fields.id]: stored.id };
      if (fields.date && date) body[fields.date] = date;
      await saveMedical(body);
      setDate('');
      onSaved();
    } catch (err) {
      setError(err?.message === 'size'
        ? (ar ? `حجم الملف أكبر من ${MAX_FILE_LABEL.ar}.` : `The file is larger than ${MAX_FILE_LABEL.en}.`)
        : messageOf(err, lang, ar ? 'تعذر رفع الملف.' : 'Could not upload the file.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="athlete-medical__doc">
      <div className="athlete-medical__doc-main">
        <span className="athlete-medical__doc-name">{ar ? document.ar : document.en}</span>
        <span className="athlete-medical__doc-state">
          {approved
            ? <Pill tone="ok">{ar ? 'معتمد' : 'Approved'}</Pill>
            : uploaded
            ? <Pill tone="ok">{ar ? 'تم الرفع — بانتظار الاعتماد' : 'Uploaded · awaiting approval'}</Pill>
            : <Pill tone="pending">{ar ? 'مطلوب' : 'Required'}</Pill>}
          {document.replacementPending && <Pill tone="info">{ar ? 'بديل بانتظار الاعتماد' : 'Replacement awaiting approval'}</Pill>}
          {document.date && <span>{formatDate(document.date, lang)}</span>}
        </span>
      </div>
      <div className="athlete-medical__doc-actions">
        {!locked && fields.date && (
          <label className="athlete-medical__date">
            <span>{ar ? 'التاريخ' : 'Date'}</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        )}
        {!locked && fields.form && (
          // The form to print, have the guardian sign, then upload here.
          <button type="button" className="btn btn--outline club-add"
                  onClick={() => openMedicalDocument(fields.form, tournamentId).catch((err) => setError(messageOf(err, lang, ar ? 'تعذر فتح النموذج.' : 'Could not open the form.')))}>
            {ar ? 'تنزيل النموذج' : 'Download form'}
          </button>
        )}
        {uploaded && (
          <button type="button" className="btn btn--outline club-add"
                  onClick={() => openMedicalDocument(document.key).catch((err) => setError(messageOf(err, lang, ar ? 'تعذر فتح الملف.' : 'Could not open the file.')))}>
            {ar ? 'عرض الملف' : 'View file'}
          </button>
        )}
        {!locked && (
          <label className="reg-doc__file">
            <input type="file" accept={ACCEPTED_FILE_TYPES} disabled={busy}
                   onChange={(event) => pick(event.target.files?.[0])} />
            <span className={`btn ${uploaded ? 'btn--outline' : 'btn--green'} club-add`}>
              {busy ? (ar ? 'جارٍ الرفع…' : 'Uploading…') : uploaded ? (ar ? 'تحديث / استبدال' : 'Update / replace') : (ar ? 'رفع' : 'Upload')}
            </span>
          </label>
        )}
      </div>
      {error && <p className="acct-error" role="alert">{error}</p>}
    </li>
  );
}

/** The health questions still unanswered; once answered they leave this list. */
function OutstandingQuestions({ questions, ar, lang, onSaved }) {
  const [answers, setAnswers] = useState({});
  const [medications, setMedications] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (Object.keys(answers).length === 0) return;
    setBusy(true);
    setError('');
    try {
      await saveMedical({
        healthAnswers: answers,
        medications: answers.medication_now ? medications.trim() || null : undefined,
      });
      setAnswers({});
      onSaved();
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر حفظ الإجابات.' : 'Could not save the answers.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="athlete-medical__block">
      <h4 className="reg-subtitle">{ar ? 'أسئلة صحية لم تُجب بعد' : 'Health questions not yet answered'}</h4>
      <ol className="reg-questions">
        {questions.map((question) => (
          <li key={question.key}>
            <p>{ar ? question.ar : question.en}</p>
            <div className="reg-yesno" role="radiogroup" aria-label={ar ? question.ar : question.en}>
              {[true, false].map((value) => (
                <label key={String(value)} className={answers[question.key] === value ? 'is-on' : ''}>
                  <input type="radio" name={`mf-${question.key}`} checked={answers[question.key] === value}
                         onChange={() => setAnswers({ ...answers, [question.key]: value })} />
                  {value ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No')}
                </label>
              ))}
            </div>
            {question.asksForDetail && answers[question.key] === true && (
              <label className="club-field reg-detail">
                <span>{ar ? 'اسم الدواء أو تفاصيله' : 'Medication name or details'}</span>
                <input type="text" value={medications} onChange={(event) => setMedications(event.target.value)} />
              </label>
            )}
          </li>
        ))}
      </ol>
      {error && <p className="acct-error" role="alert">{error}</p>}
      <button type="button" className="btn btn--green club-add" onClick={save}
              disabled={busy || Object.keys(answers).length === 0}>
        {busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ الإجابات' : 'Save answers')}
      </button>
    </div>
  );
}

/** The declarations still to accept, the non-pregnancy one included where it applies. */
function OutstandingDeclarations({ data, ar, lang, onSaved }) {
  const [accepted, setAccepted] = useState({});
  const [notPregnant, setNotPregnant] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = Object.keys(accepted).filter((key) => accepted[key]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const body = {};
      if (chosen.length) body.declarations = Object.fromEntries(chosen.map((key) => [key, true]));
      if (notPregnant) body.notPregnantDeclared = true;
      await saveMedical(body);
      setAccepted({});
      setNotPregnant(false);
      onSaved();
    } catch (err) {
      setError(messageOf(err, lang, ar ? 'تعذر حفظ الإقرارات.' : 'Could not save the declarations.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="athlete-medical__block">
      <h4 className="reg-subtitle">{ar ? 'إقرارات وموافقات متبقية' : 'Declarations & consents still open'}</h4>
      <div className="reg-declarations">
        {data.declarations.map((entry) => (
          <label key={entry.key} className="reg-check">
            <input type="checkbox" checked={Boolean(accepted[entry.key])}
                   onChange={(event) => setAccepted({ ...accepted, [entry.key]: event.target.checked })} />
            <span>{ar ? entry.ar : entry.en}</span>
          </label>
        ))}
        {data.pregnancyDeclarationOutstanding && (
          <label className="reg-check">
            <input type="checkbox" checked={notPregnant} onChange={(event) => setNotPregnant(event.target.checked)} />
            <span>{ar ? 'إقرار عدم الحمل: أقر بأنني لست حاملًا.' : 'Non-pregnancy declaration: I declare that I am not pregnant.'}</span>
          </label>
        )}
      </div>
      {error && <p className="acct-error" role="alert">{error}</p>}
      <button type="button" className="btn btn--green club-add" onClick={save}
              disabled={busy || (chosen.length === 0 && !notPregnant)}>
        {busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ الإقرارات' : 'Save declarations')}
      </button>
    </div>
  );
}
