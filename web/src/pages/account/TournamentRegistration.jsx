import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  enter, fetchRegistrationForm, messageOf, openMedicalDocument, refreshNotices, uploadMedicalAttachment,
} from '../../api/member';
import { DEFAULT_DIAL, DIAL_CODES } from '../../data/countries';
import { MEDICAL_DOCUMENT_TEMPLATES } from '../../data/medicalForms';
import { ACCEPTED_FILE_TYPES, MAX_FILE_BYTES, MAX_FILE_LABEL } from '../../data/registrationPortal';
import { compressImage } from '../../utils/compressImage';
import { formatDateRange, toLatinDigits } from '../../utils/format';
import { IconCalendar, IconPerson, IconPhone } from '../../components/icons/Icons';
import {
  IconBuilding, IconCheck, IconChecklist, IconChevron, IconClipboard, IconClose, IconCoach, IconDownload,
  IconDumbbell, IconEdit, IconFileText, IconHeartPulse, IconInfo, IconMedal, IconPlayers, IconRuler,
  IconTestTubes, IconUpload, IconWeight,
} from '../../components/icons/AccountIcons';

/**
 * Registering one athlete in one tournament — Phase 3 REQ-03, with the
 * athlete's own medical section from REQ-04 — in three steps:
 *
 *   1. Registration — the athlete, the category and weight class, and this
 *      registration's details, on one page.
 *   2. Medical Requirements — only when the athlete registers themselves;
 *      one scrolling page, optional throughout (REQ-04 rule 6).
 *   3. Review & Confirmation — a summary, then the single submission.
 *
 * A club or a coach registers without step 2: the medical part is the
 * athlete's own, finished later from their Medical File.
 *
 * The server decides everything that matters: who the athlete is, their age
 * for this tournament's year, their gender, which categories and weight
 * classes are open to them, and which medical items apply to them. This
 * screen shows those answers and takes the choices left to a person.
 *
 * The registration details (club or centre, coach, weight, height) belong to
 * this entry only; changing them here leaves the athlete's profile as it is.
 */

const GENDER = { male: { ar: 'ذكر', en: 'Male' }, female: { ar: 'أنثى', en: 'Female' } };

const EMPTY_DOC = { id: null, name: '', date: '', busy: false, error: '' };

/** "+966512340001" → ["966", "512340001"], by the longest dialling code that fits. */
function splitPhone(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (!digits) return [DEFAULT_DIAL, ''];
  const dial = String(value).trim().startsWith('+') ? DIAL_CODES.find((code) => digits.startsWith(code)) : null;
  return dial ? [dial, digits.slice(dial.length)] : [DEFAULT_DIAL, digits];
}

export default function TournamentRegistration({ tournamentId, athleteRegistrationId, ar, lang, onClose, onDone }) {
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState('');
  const [divisionId, setDivisionId] = useState(null);
  const [info, setInfo] = useState({ clubName: '', coachName: '', dial: DEFAULT_DIAL, phone: '', currentWeight: '', height: '' });
  const [docs, setDocs] = useState({
    certificate: EMPTY_DOC, screening: EMPTY_DOC, guardian: EMPTY_DOC, pregnancy: EMPTY_DOC,
  });
  const [answers, setAnswers] = useState({});
  const [medications, setMedications] = useState('');
  const [declarations, setDeclarations] = useState({});
  const [notPregnant, setNotPregnant] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const t = (arText, enText) => (ar ? arText : enText);

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationForm(tournamentId, athleteRegistrationId)
      .then((data) => {
        if (cancelled) return;
        setForm(data);
        const options = data.eligibility.eligibleCategories;
        // One category on offer: it is simply the category.
        if (options.length === 1) setCategory(options[0].category);
        const [dial, phone] = splitPhone(data.prefill.coachPhone);
        setInfo({
          clubName: data.prefill.clubName || '',
          coachName: data.prefill.coachName || '',
          dial,
          phone,
          currentWeight: data.prefill.currentWeight || '',
          height: data.prefill.height || '',
        });
        if (data.medical) {
          // What the athlete already told the federation stays filled in.
          setAnswers(Object.fromEntries(data.medical.questions
            .filter((question) => question.answer !== null)
            .map((question) => [question.key, question.answer])));
          setMedications(data.medical.medications || '');
          setDeclarations(Object.fromEntries(data.medical.declarations.map((entry) => [entry.key, entry.accepted])));
          setNotPregnant(data.medical.notPregnantDeclared === true);
        }
      })
      .catch((err) => !cancelled && setLoadError(messageOf(err, lang,
        ar ? 'تعذر تحميل نموذج التسجيل.' : 'Could not load the registration form.')));
    return () => { cancelled = true; };
  }, [tournamentId, athleteRegistrationId, lang, ar]);

  // After the new step has rendered, bring the wizard's own top — its heading
  // and step indicator — into view, just below the sticky site header. The
  // header is measured rather than assumed, and the gap is the wizard's
  // scroll-margin in CSS. Not on first open, and not when the step did not
  // change (a failed validation stays put).
  const wizardRef = useRef(null);
  const shownStep = useRef(step);
  useLayoutEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const wizard = wizardRef.current;
    if (!wizard) return;
    const header = document.querySelector('.site-header');
    // Once the page scrolls the sticky header sits at the very top, so its
    // height is what covers the page.
    const headerHeight = header && getComputedStyle(header).position === 'sticky'
      ? header.getBoundingClientRect().height
      : 0;
    const gap = parseFloat(getComputedStyle(wizard).scrollMarginTop) || 0;
    const top = window.scrollY + wizard.getBoundingClientRect().top - headerHeight - gap;
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }, [step]);

  if (loadError) {
    return (
      <div className="rg">
        <p className="club-dash__error" role="alert">{loadError}</p>
        <button type="button" className="btn btn--outline" onClick={onClose}>{t('رجوع', 'Back')}</button>
      </div>
    );
  }

  if (!form) return <p className="club-dash__loading">{t('جارٍ التحميل…', 'Loading…')}</p>;

  const { eligibility, athlete, tournament, medical } = form;
  const selfService = Boolean(medical);
  const steps = [
    { key: 'registration', ar: 'التسجيل', en: 'Registration' },
    ...(selfService ? [{ key: 'medical', ar: 'المتطلبات الطبية', en: 'Medical requirements' }] : []),
    { key: 'review', ar: 'المراجعة والتأكيد', en: 'Review & confirmation' },
  ];
  const current = steps[step].key;
  const options = eligibility.eligibleCategories;
  const option = options.find((entry) => entry.category === category);
  const division = option?.divisions.find((entry) => entry.divisionId === divisionId);
  const athleteName = (ar ? athlete.nameAr || athlete.nameEn : athlete.nameEn || athlete.nameAr) || '—';
  const weightLabel = (entry) => (ar ? entry.labelAr : entry.labelEn).split(' – ').pop();
  const phoneDigits = info.phone.replace(/[^\d]/g, '');
  const coachPhone = phoneDigits ? `+${info.dial}${phoneDigits}` : '';
  // Nothing to choose from, or already in: say so, and offer no way forward.
  const blocked = !eligibility.canEnter;

  function goTo(index) {
    setError('');
    setStep(index);
  }


  function next() {
    if (current === 'registration') {
      if (!division) {
        setError(t('اختر الفئة وفئة الوزن للمتابعة.', 'Choose a category and a weight class to continue.'));
        return;
      }
      const weight = info.currentWeight === '' ? null : Number(info.currentWeight);
      const height = info.height === '' ? null : Number(info.height);
      if ((weight !== null && !(weight > 0 && weight <= 300)) || (height !== null && !(height > 0 && height <= 260))) {
        setError(t('أدخل وزنًا وطولًا صحيحين، أو اتركهما فارغين.', 'Enter a valid weight and height, or leave them empty.'));
        return;
      }
    }
    goTo(Math.min(step + 1, steps.length - 1));
  }

  async function pick(slot, picked) {
    if (!picked) return;
    setDocs((all) => ({ ...all, [slot]: { ...all[slot], busy: true, error: '' } }));
    try {
      const file = await compressImage(picked);
      if (file.size > MAX_FILE_BYTES) throw new Error('size');
      const stored = await uploadMedicalAttachment(file);
      setDocs((all) => ({ ...all, [slot]: { ...all[slot], id: stored.id, name: stored.fileName, busy: false } }));
    } catch (err) {
      const message = err?.message === 'size'
        ? t(`حجم الملف أكبر من ${MAX_FILE_LABEL.ar}.`, `The file is larger than ${MAX_FILE_LABEL.en}.`)
        : messageOf(err, lang, t('تعذر رفع الملف.', 'Could not upload the file.'));
      setDocs((all) => ({ ...all, [slot]: { ...all[slot], busy: false, error: message } }));
    }
  }

  /** The athlete's medical section as their file takes it: only what was filled in. */
  function medicalBody() {
    // Final Approval holds the file: nothing of it is sent with the entry.
    if (!selfService || medical?.medicalLock) return undefined;
    const body = {};
    // A date goes only with its document; on its own it would sit beside a
    // file that was never uploaded.
    if (docs.certificate.id) {
      body.certificateAttachmentId = docs.certificate.id;
      if (docs.certificate.date) body.certificateDate = docs.certificate.date;
    }
    if (medical.screeningApplies && docs.screening.id) {
      body.screeningAttachmentId = docs.screening.id;
      if (docs.screening.date) body.screeningDate = docs.screening.date;
    }
    if (Object.keys(answers).length) {
      body.healthAnswers = answers;
      if (answers.medication_now) body.medications = medications.trim() || null;
    }
    if (medical.declarationsApply) {
      const accepted = Object.fromEntries(Object.entries(declarations).filter(([, value]) => value));
      if (Object.keys(accepted).length) body.declarations = accepted;
      if (medical.pregnancyDeclarationApplies && notPregnant) body.notPregnantDeclared = true;
    }
    if (medical.guardianConsentApplies && docs.guardian.id) body.guardianConsentAttachmentId = docs.guardian.id;
    if (medical.pregnancyDocumentApplies && docs.pregnancy.id) body.pregnancyDeclarationAttachmentId = docs.pregnancy.id;
    return Object.keys(body).length ? body : undefined;
  }

  async function submit() {
    // One submission: the button is held while it is under way.
    if (busy || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      await enter(tournamentId, {
        athleteRegistrationId: athlete.registrationId,
        divisionId,
        clubName: info.clubName.trim() || null,
        coachName: info.coachName.trim() || null,
        coachPhone: coachPhone || null,
        declaredWeightKg: info.currentWeight === '' ? null : Number(info.currentWeight),
        heightCm: info.height === '' ? null : Number(info.height),
        medical: medicalBody(),
      });
      refreshNotices();
      setDone(true);
    } catch (err) {
      setError(messageOf(err, lang, t('تعذر إتمام التسجيل.', 'Could not complete the registration.')));
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rg">
        <div className="reg-done" role="status">
          <span className="reg-done__mark" aria-hidden="true"><IconCheck /></span>
          <strong>{t('تم التسجيل في البطولة', 'Registered in the tournament')}</strong>
          <p>
            {selfService
              ? t('أصبحت مسجلًا في هذه البطولة. يمكنك استكمال أي متطلبات طبية متبقية من الملف الطبي.',
                'You are now registered in this tournament. Any medical requirements still open can be completed from your Medical File.')
              : t(`أصبح ${athleteName} مسجلًا في هذه البطولة، وتم إشعاره بذلك. يستكمل اللاعب متطلباته الطبية من ملفه الطبي.`,
                `${athleteName} is now registered in this tournament and has been notified. The athlete completes their medical requirements from their Medical File.`)}
          </p>
          <button type="button" className="btn btn--green" onClick={onDone}>{t('تم', 'Done')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rg" ref={wizardRef}>
      <header className="rg__head">
        <div>
          <span className="rg__eyebrow">{t('التسجيل في بطولة', 'Tournament registration')}</span>
          <h3 className="rg__title">{ar ? tournament.nameAr : tournament.nameEn}</h3>
          <span className="rg__date"><IconCalendar aria-hidden="true" />{formatDateRange(tournament.startDate, tournament.endDate, lang)}</span>
        </div>
        <button type="button" className="rg__cancel" onClick={onClose}>
          <IconClose aria-hidden="true" />{t('إلغاء التسجيل', 'Cancel registration')}
        </button>
      </header>

      {!blocked && <Stepper steps={steps} step={step} ar={ar} />}

      {current === 'registration' && (
        <section className="rg-panel">
          <PanelTitle Icon={IconPerson} title={t('بيانات اللاعب', 'Athlete')} />
          <dl className="rg-athlete">
            <div className="rg-athlete__name">
              <IconPerson aria-hidden="true" />
              <dd>{athleteName}</dd>
            </div>
            <div>
              <dt>{t('العمر', 'Age')}</dt>
              <dd>{eligibility.competitionAge === null ? '—' : t(`${toLatinDigits(eligibility.competitionAge)} سنة`, `${eligibility.competitionAge} years`)}</dd>
            </div>
            <div>
              <dt>{t('الجنس', 'Gender')}</dt>
              <dd>{GENDER[eligibility.gender] ? (ar ? GENDER[eligibility.gender].ar : GENDER[eligibility.gender].en) : '—'}</dd>
            </div>
          </dl>

          {blocked ? (
            eligibility.existingEntry ? (
              <div className="rg-notice">
                <IconInfo aria-hidden="true" />
                <p>
                  {t(`مسجل مسبقًا في هذه البطولة: ${eligibility.existingEntry.divisionAr || eligibility.existingEntry.categoryAr}.`,
                    `Already registered in this tournament: ${eligibility.existingEntry.divisionEn || eligibility.existingEntry.categoryEn}.`)}
                </p>
              </div>
            ) : (
              <div className="rg-notice is-blocked" role="alert">
                <IconInfo aria-hidden="true" />
                <div>
                  <strong>{t('لا يمكن التسجيل في هذه البطولة', 'Registration is not possible')}</strong>
                  <ul>{eligibility.barriers.map((barrier) => <li key={barrier.code}>{ar ? barrier.ar : barrier.en}</li>)}</ul>
                </div>
              </div>
            )
          ) : (
            <>
              <div className="rg-division">
                <label className="rg-field">
                  <span className="rg-label">{t('الفئة', 'Category')} <em aria-hidden="true">*</em></span>
                  <select className="rg-select" value={category} disabled={options.length === 1}
                          onChange={(event) => { setCategory(event.target.value); setDivisionId(null); }}>
                    {options.length > 1 && <option value="">{t('اختر الفئة', 'Choose a category')}</option>}
                    {options.map((entry) => (
                      <option key={entry.category} value={entry.category}>{ar ? entry.categoryAr : entry.categoryEn}</option>
                    ))}
                  </select>
                  {options.length > 1 && (
                    <span className="rg-hint">{t('يمكن المشاركة في فئة واحدة فقط في البطولة.', 'An athlete competes in one category per tournament.')}</span>
                  )}
                </label>
                <div className="rg-field">
                  <span className="rg-label" id="rg-weight-label">{t('فئة الوزن', 'Weight class')} <em aria-hidden="true">*</em></span>
                  {option ? (
                    <div className="rg-weights" role="radiogroup" aria-labelledby="rg-weight-label">
                      {option.divisions.map((entry) => (
                        <label key={entry.divisionId} className={`rg-weight${divisionId === entry.divisionId ? ' is-on' : ''}`}>
                          <input type="radio" name="rg-division" checked={divisionId === entry.divisionId}
                                 onChange={() => setDivisionId(entry.divisionId)} />
                          {divisionId === entry.divisionId && <IconCheck className="rg-weight__tick" aria-hidden="true" />}
                          <span>{weightLabel(entry)}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="rg-hint">{t('اختر الفئة أولًا.', 'Choose the category first.')}</span>
                  )}
                </div>
              </div>

              <div className="rg-divider" />

              <PanelTitle Icon={IconFileText} title={t('بيانات التسجيل', 'Registration details')} small />
              <p className="rg-hint rg-hint--lead">
                {t('هذه البيانات خاصة بهذا التسجيل فقط، ولا تغيّر الملف الرياضي للاعب.',
                  'These details belong to this registration only; they do not change the athlete’s Sports Profile.')}
              </p>
              <div className="rg-details">
                <label className="rg-field">
                  <span className="rg-label">{t('النادي / المركز التدريبي', 'Club / training centre')}</span>
                  <input type="text" value={info.clubName} onChange={(event) => setInfo({ ...info, clubName: event.target.value })} />
                </label>
                <label className="rg-field">
                  <span className="rg-label">{t('اسم المدرب', 'Coach name')}</span>
                  <input type="text" value={info.coachName} onChange={(event) => setInfo({ ...info, coachName: event.target.value })} />
                </label>
                <div className="rg-field">
                  <span className="rg-label" id="rg-phone-label">{t('رقم جوال المدرب', 'Coach mobile')}</span>
                  <div className="rg-phone" dir="ltr" role="group" aria-labelledby="rg-phone-label">
                    <select className="rg-select" value={info.dial} aria-label={t('رمز الدولة', 'Country code')}
                            onChange={(event) => setInfo({ ...info, dial: event.target.value })}>
                      {DIAL_CODES.slice().sort((a, b) => Number(a) - Number(b)).map((code) => (
                        <option key={code} value={code}>+{code}</option>
                      ))}
                    </select>
                    <input type="tel" inputMode="tel" value={info.phone} aria-label={t('رقم الجوال', 'Mobile number')}
                           onChange={(event) => setInfo({ ...info, phone: event.target.value })} />
                  </div>
                </div>
                <label className="rg-field rg-field--short">
                  <span className="rg-label">{t('الوزن الحالي (كجم)', 'Current weight (kg)')}</span>
                  <input type="number" inputMode="decimal" step="0.1" dir="ltr" value={info.currentWeight}
                         onChange={(event) => setInfo({ ...info, currentWeight: event.target.value })} />
                </label>
                <label className="rg-field rg-field--short">
                  <span className="rg-label">{t('الطول (سم)', 'Height (cm)')}</span>
                  <input type="number" inputMode="decimal" dir="ltr" value={info.height}
                         onChange={(event) => setInfo({ ...info, height: event.target.value })} />
                </label>
              </div>
            </>
          )}
        </section>
      )}

      {current === 'medical' && medical?.medicalLock && (
        <MedicalLocked ar={ar} lock={medical.medicalLock} />
      )}

      {current === 'medical' && medical && !medical.medicalLock && (
        <MedicalStep
          tournamentId={tournament.id}
          medical={medical}
          ar={ar}
          lang={lang}
          docs={docs}
          setDoc={(slot, patch) => setDocs((all) => ({ ...all, [slot]: { ...all[slot], ...patch } }))}
          pick={pick}
          answers={answers}
          setAnswers={setAnswers}
          medications={medications}
          setMedications={setMedications}
          declarations={declarations}
          setDeclarations={setDeclarations}
          notPregnant={notPregnant}
          setNotPregnant={setNotPregnant}
        />
      )}

      {current === 'review' && (
        <>
          <section className="rg-panel">
            <PanelTitle Icon={IconClipboard} title={t('بيانات التسجيل', 'Registration details')}
                        action={<EditLink ar={ar} onClick={() => goTo(0)} />} />
            <dl className="rg-tiles">
              <Tile Icon={IconPerson} label={t('اللاعب', 'Athlete')} value={athleteName} />
              <Tile Icon={IconMedal} label={t('الفئة', 'Category')} value={option ? (ar ? option.categoryAr : option.categoryEn) : ''} />
              <Tile Icon={IconDumbbell} label={t('فئة الوزن', 'Weight class')} value={division ? weightLabel(division) : ''} />
              <Tile Icon={IconWeight} label={t('الوزن الحالي', 'Current weight')}
                    value={info.currentWeight ? `${toLatinDigits(info.currentWeight)} ${t('كجم', 'kg')}` : ''} />
              <Tile Icon={IconBuilding} label={t('النادي / مركز التدريب', 'Club / training centre')} value={info.clubName} />
              <Tile Icon={IconCoach} label={t('المدرب', 'Coach')} value={info.coachName} />
              <Tile Icon={IconPhone} label={t('جوال المدرب', 'Coach mobile')} value={coachPhone} ltr />
              <Tile Icon={IconRuler} label={t('الطول', 'Height')}
                    value={info.height ? `${toLatinDigits(info.height)} ${t('سم', 'cm')}` : ''} />
            </dl>
          </section>

          {selfService && (
            <section className="rg-panel">
              <PanelTitle Icon={IconHeartPulse} title={t('المتطلبات الطبية', 'Medical requirements')}
                          action={<EditLink ar={ar} onClick={() => goTo(1)} />} />
              <MedicalSummary medical={medical} docs={docs} answers={answers}
                              declarations={declarations} notPregnant={notPregnant} ar={ar} />
            </section>
          )}

          <div className="rg-notice">
            <IconInfo aria-hidden="true" />
            <div>
              <strong>
                {selfService
                  ? t('بإرسال التسجيل سيتم تسجيلك مباشرة في البطولة.', 'Submitting registers you in the tournament straight away.')
                  : t('بإرسال التسجيل سيتم تسجيل اللاعب مباشرة في البطولة، وسيتم إشعاره بذلك.',
                    'Submitting registers the athlete in the tournament straight away, and they are notified.')}
              </strong>
              <p>
                {selfService
                  ? t('يمكنك استكمال المتطلبات الطبية الناقصة لاحقًا من الملف الطبي قبل مرحلة الفحص والاعتماد للمنافسة.',
                    'Any medical requirements still open can be completed later from your Medical File, before the examination and competition clearance.')
                  : t('المعلومات الطبية يستكملها اللاعب بنفسه من ملفه الطبي قبل مرحلة الفحص والاعتماد للمنافسة، ولا تُطلب منك هنا.',
                    'The athlete completes their medical information from their Medical File before the examination and competition clearance; it is not asked of you here.')}
              </p>
            </div>
          </div>

          <label className="rg-confirm">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>{t('أؤكد أن بيانات التسجيل أعلاه صحيحة.', 'I confirm that the registration details above are correct.')}</span>
          </label>
        </>
      )}

      {error && <p className="acct-error" role="alert">{error}</p>}

      <div className="rg-actions">
        {blocked ? (
          <button type="button" className="btn btn--outline" onClick={onClose}>{t('رجوع', 'Back')}</button>
        ) : (
          <>
            {step > 0 ? (
              <button type="button" className="btn btn--outline rg-back" onClick={() => goTo(step - 1)} disabled={busy}>
                {/* Back points the way the page reads from: right in Arabic. */}
                <IconChevron left={!ar} aria-hidden="true" />{t('السابق', 'Previous')}
              </button>
            ) : <span />}
            {current === 'review' ? (
              <button type="button" className="btn btn--green rg-next" onClick={submit} disabled={busy || !confirmed}>
                <IconCheck aria-hidden="true" />
                {busy ? t('جارٍ التسجيل…', 'Registering…') : t('تأكيد التسجيل', 'Confirm registration')}
              </button>
            ) : (
              <button type="button" className="btn btn--green rg-next" onClick={next}>
                {t('التالي', 'Next')}<IconChevron left={ar} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The connected stepper: a tick for each step done, the current one filled. */
function Stepper({ steps, step, ar }) {
  return (
    <ol className="rg-stepper" aria-label={ar ? 'خطوات التسجيل' : 'Registration steps'}>
      {steps.map((entry, index) => {
        const state = index < step ? 'is-done' : index === step ? 'is-current' : '';
        return (
          <li key={entry.key} className={state} aria-current={index === step ? 'step' : undefined}>
            <span className="rg-stepper__dot">
              {index < step ? <IconCheck aria-hidden="true" /> : toLatinDigits(index + 1)}
            </span>
            <span className="rg-stepper__label">{ar ? entry.ar : entry.en}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PanelTitle({ Icon, title, action, small = false }) {
  return (
    <div className={`rg-panel__title${small ? ' is-small' : ''}`}>
      <h4><Icon aria-hidden="true" />{title}</h4>
      {action}
    </div>
  );
}

function EditLink({ ar, onClick }) {
  return (
    <button type="button" className="rg-edit" onClick={onClick}>
      <IconEdit aria-hidden="true" />{ar ? 'تعديل' : 'Edit'}
    </button>
  );
}

function Tile({ Icon, label, value, ltr = false }) {
  return (
    <div className="rg-tile">
      <span className="rg-tile__icon"><Icon aria-hidden="true" /></span>
      <div>
        <dt>{label}</dt>
        <dd dir={ltr && value ? 'ltr' : undefined}>{value || '—'}</dd>
      </div>
    </div>
  );
}

/**
 * REQ-04 for the athlete registering themselves, on one scrolling page:
 * under 18 — documents, signed approvals, health questions; 18 and over —
 * documents, health questions, electronic declarations. Then the notice.
 * Which items appear is the server's answer, from the athlete's own record.
 */
/**
 * The athlete holds Final Approval in an active tournament, which locks their
 * Medical File: it is used as it stands, and only the federation can change it.
 */
function MedicalLocked({ ar, lock }) {
  const t = (arText, enText) => (ar ? arText : enText);
  const names = lock.tournaments.map((x) => (ar ? x.nameAr || x.nameEn : x.nameEn || x.nameAr)).join(ar ? '، ' : ', ');
  return (
    <section className="rg-panel">
      <PanelTitle Icon={IconClipboard} title={t('المتطلبات الطبية', 'Medical requirements')} />
      <div className="rg-notice" role="note">
        <IconInfo aria-hidden="true" />
        <p>
          {t(
            `ملفك الطبي مقفل لحصولك على الاعتماد النهائي في: ${names}. سيُستخدم كما هو في هذا التسجيل، ويمكنك الاطلاع عليه من الملف الطبي. لتعديله تواصل مع الاتحاد.`,
            `Your Medical File is locked because you have Final Approval in: ${names}. It is used as it stands for this registration, and you can view it in your Medical File. To change it, contact the federation.`,
          )}
        </p>
      </div>
    </section>
  );
}

function MedicalStep({
  tournamentId, medical, ar, lang, docs, setDoc, pick, answers, setAnswers, medications, setMedications,
  declarations, setDeclarations, notPregnant, setNotPregnant,
}) {
  const t = (arText, enText) => (ar ? arText : enText);
  const [formError, setFormError] = useState('');
  const openForm = (slot) => openMedicalDocument(slot, tournamentId)
    .catch((err) => setFormError(messageOf(err, lang, t('تعذر فتح الملف.', 'Could not open the file.'))));

  return (
    <section className="rg-panel">
      <PanelTitle Icon={IconClipboard} title={t('المتطلبات الطبية', 'Medical requirements')} />

      <div className="rg-block">
        <h5 className="rg-block__title"><IconFileText aria-hidden="true" />{t('المستندات الطبية', 'Medical documents')}</h5>
        <div className="rg-docs">
          <DocumentCard
            ar={ar}
            Icon={IconFileText}
            title={t('الشهادة الطبية', 'Medical certificate')}
            dateLabel={t('تاريخ الشهادة', 'Certificate date')}
            onFile={medical.hasCertificate}
            doc={docs.certificate}
            onPick={(file) => pick('certificate', file)}
            onDate={(date) => setDoc('certificate', { date })}
            downloadHref={MEDICAL_DOCUMENT_TEMPLATES.certificate}
            onView={medical.hasCertificate ? () => openForm('certificate') : null}
          />
          {medical.screeningApplies && (
            <DocumentCard
              ar={ar}
              Icon={IconTestTubes}
              title={t('تحليل HIV / HBV / HCV', 'HIV / HBV / HCV test')}
              dateLabel={t('تاريخ التحليل', 'Test date')}
              onFile={medical.hasScreening}
              doc={docs.screening}
              onPick={(file) => pick('screening', file)}
              onDate={(date) => setDoc('screening', { date })}
              downloadHref={MEDICAL_DOCUMENT_TEMPLATES.screening}
              onView={medical.hasScreening ? () => openForm('screening') : null}
            />
          )}
        </div>
      </div>

      {/* Under 18 the signed approvals follow the documents, before the
          questions; 18 and over, the electronic declarations come after them. */}
      {medical.guardianConsentApplies && (
        <div className="rg-block">
          <h5 className="rg-block__title"><IconPlayers aria-hidden="true" />{t('الموافقات', 'Approvals')}</h5>
          <div className="rg-docs">
            <DocumentCard
              ar={ar}
              Icon={IconFileText}
              title={t('موافقة ولي الأمر', 'Guardian consent')}
              hint={t('قم بتنزيل النموذج وتوقيعه من ولي الأمر ثم رفعه.', 'Download the form, have the guardian sign it, then upload it.')}
              onFile={medical.hasGuardianConsent}
              doc={docs.guardian}
              onPick={(file) => pick('guardian', file)}
              onDownload={() => openForm('guardian_form')}
            />
            {medical.pregnancyDocumentApplies && (
              <DocumentCard
                ar={ar}
                Icon={IconFileText}
                title={t('إقرار عدم الحمل', 'Non-pregnancy declaration')}
                hint={t('قم بتنزيل النموذج وتوقيعه من ولي الأمر ثم رفعه.', 'Download the form, have the guardian sign it, then upload it.')}
                onFile={medical.hasPregnancyDocument}
                doc={docs.pregnancy}
                onPick={(file) => pick('pregnancy', file)}
                onDownload={() => openForm('pregnancy_form')}
              />
            )}
          </div>
        </div>
      )}

      <div className="rg-block">
        <h5 className="rg-block__title"><IconHeartPulse aria-hidden="true" />{t('الأسئلة الصحية', 'Health questions')}</h5>
        <ol className="rg-questions">
          {medical.questions.map((question) => (
            <li key={question.key}>
              <div className="rg-question">
                <p>{ar ? question.ar : question.en}</p>
                <div className="rg-yesno" role="radiogroup" aria-label={ar ? question.ar : question.en}>
                  {[true, false].map((value) => (
                    <label key={String(value)} className={answers[question.key] === value ? 'is-on' : ''}>
                      <input type="radio" name={`rg-q-${question.key}`} checked={answers[question.key] === value}
                             onChange={() => setAnswers({ ...answers, [question.key]: value })} />
                      {value ? t('نعم', 'Yes') : t('لا', 'No')}
                    </label>
                  ))}
                </div>
              </div>
              {question.asksForDetail && answers[question.key] === true && (
                <label className="rg-field rg-detail">
                  <span className="rg-label">{t('اسم الدواء أو تفاصيله', 'Medication name or details')}</span>
                  <input type="text" value={medications} onChange={(event) => setMedications(event.target.value)} />
                </label>
              )}
            </li>
          ))}
        </ol>
      </div>

      {medical.declarationsApply && (
        <div className="rg-block">
          <h5 className="rg-block__title"><IconChecklist aria-hidden="true" />{t('الإقرارات', 'Declarations')}</h5>
          <div className="rg-declarations">
            {medical.declarations.map((entry) => (
              <label key={entry.key} className="rg-check">
                <input type="checkbox" checked={Boolean(declarations[entry.key])}
                       onChange={(event) => setDeclarations({ ...declarations, [entry.key]: event.target.checked })} />
                <span>{ar ? entry.ar : entry.en}</span>
              </label>
            ))}
            {medical.pregnancyDeclarationApplies && (
              <label className="rg-check">
                <input type="checkbox" checked={notPregnant} onChange={(event) => setNotPregnant(event.target.checked)} />
                <span>{t('إقرار عدم الحمل: أقر بأنني لست حاملًا.', 'Non-pregnancy declaration: I declare that I am not pregnant.')}</span>
              </label>
            )}
          </div>
        </div>
      )}

      {formError && <p className="acct-error" role="alert">{formError}</p>}

      <div className="rg-notice is-soft" role="note">
        <IconInfo aria-hidden="true" />
        <p>
          {t('جميع المتطلبات الطبية اختيارية أثناء التسجيل، ولن يمنع عدم استكمالها من إرسال التسجيل. ويمكن استكمالها لاحقًا من الملف الطبي، لكن يجب استكمال المطلوب منها قبل مرحلة الفحص والاعتماد للمنافسة، وإلا فقد لا يُسمح للاعب بالمنافسة.',
            'All medical requirements are optional during registration and do not prevent submitting it. They can be completed later from the Medical File, but the required ones must be complete before the examination and competition clearance stage; otherwise the athlete may not be allowed to compete.')}
        </p>
      </div>
    </section>
  );
}

/**
 * One document item, the same for every document: its title, its date (label
 * above the field) where it has one, then Download and Upload side by side at
 * the field's height.
 *
 * Download is either a generated form (onDownload), a blank template file
 * (downloadHref) or — for a medical document whose template the federation
 * has not supplied yet (downloadHref === null) — shown but not yet available.
 */
function DocumentCard({
  ar, Icon, title, dateLabel, hint, onFile, doc, onPick, onDate, onDownload, downloadHref, onView,
}) {
  const t = (arText, enText) => (ar ? arText : enText);
  const state = doc.id ? 'uploaded' : onFile ? 'onFile' : 'missing';
  const templatePending = downloadHref === null;
  return (
    <div className="rg-doc">
      <div className="rg-doc__head">
        <strong><Icon aria-hidden="true" />{title}</strong>
        {state === 'uploaded' && <span className="rg-chip is-ok"><IconCheck aria-hidden="true" />{t('تم الرفع', 'Uploaded')}</span>}
        {state === 'onFile' && <span className="rg-chip is-ok"><IconCheck aria-hidden="true" />{t('موجود في ملفك', 'On your file')}</span>}
      </div>
      <div className={`rg-doc__body${dateLabel ? ' has-date' : ''}`}>
        {dateLabel && (
          <label className="rg-field rg-doc__date">
            <span className="rg-label">{dateLabel}</span>
            <input type="date" value={doc.date} onChange={(event) => onDate(event.target.value)} />
          </label>
        )}
        <div className="rg-doc__actions">
          {onDownload && (
            <button type="button" className="btn btn--outline rg-btn rg-btn--green" onClick={onDownload}>
              <IconDownload aria-hidden="true" />{t('تنزيل', 'Download')}
            </button>
          )}
          {downloadHref && (
            <a className="btn btn--outline rg-btn rg-btn--green" href={downloadHref} download target="_blank" rel="noopener noreferrer">
              <IconDownload aria-hidden="true" />{t('تنزيل', 'Download')}
            </a>
          )}
          {templatePending && (
            <button type="button" className="btn btn--outline rg-btn" disabled
                    title={t('النموذج غير متوفر بعد', 'The form is not available yet')}>
              <IconDownload aria-hidden="true" />{t('تنزيل', 'Download')}
            </button>
          )}
          <label className="rg-file">
            <input type="file" accept={ACCEPTED_FILE_TYPES} disabled={doc.busy} onChange={(event) => onPick(event.target.files?.[0])} />
            <span className="btn btn--outline rg-btn">
              <IconUpload aria-hidden="true" />
              {doc.busy ? t('جارٍ الرفع…', 'Uploading…') : state === 'missing' ? t('رفع الملف', 'Upload file') : t('استبدال الملف', 'Replace file')}
            </span>
          </label>
        </div>
      </div>
      {templatePending && <span className="rg-hint">{t('نموذج التنزيل غير متوفر بعد.', 'The downloadable form is not available yet.')}</span>}
      {onView && !doc.id && (
        <button type="button" className="rg-link" onClick={onView}>{t('عرض الملف الحالي', 'View current file')}</button>
      )}
      {hint && <span className="rg-hint">{hint}</span>}
      {onFile && doc.id && (
        <span className="rg-hint">{t('استبدال مستند موجود يتطلب اعتماد الجهة المختصة قبل استخدامه.', 'Replacing a document already on file needs approval before it is used.')}</span>
      )}
      {doc.error && <p className="acct-error" role="alert">{doc.error}</p>}
    </div>
  );
}

/** The medical step as statuses: only what applies to this athlete, never the form again. */
function MedicalSummary({ medical, docs, answers, declarations, notPregnant, ar }) {
  const t = (arText, enText) => (ar ? arText : enText);
  const answered = medical.questions.filter((question) => answers[question.key] !== undefined).length;
  const declarationItems = medical.declarations.length + (medical.pregnancyDeclarationApplies ? 1 : 0);
  const declared = medical.declarations.filter((entry) => declarations[entry.key]).length
    + (medical.pregnancyDeclarationApplies && notPregnant ? 1 : 0);
  const approvals = [
    Boolean(docs.guardian.id || medical.hasGuardianConsent),
    ...(medical.pregnancyDocumentApplies ? [Boolean(docs.pregnancy.id || medical.hasPregnancyDocument)] : []),
  ];
  const approvalsDone = approvals.filter(Boolean).length;
  const uploaded = (slot, onFile) => Boolean(docs[slot].id || onFile);

  const items = [
    {
      key: 'certificate', Icon: IconFileText, label: t('الشهادة الطبية', 'Medical certificate'),
      done: uploaded('certificate', medical.hasCertificate),
      text: uploaded('certificate', medical.hasCertificate) ? t('تم الرفع', 'Uploaded') : t('لم يُرفع', 'Not uploaded'),
    },
    ...(medical.screeningApplies ? [{
      key: 'screening', Icon: IconTestTubes, label: 'HIV / HBV / HCV',
      done: uploaded('screening', medical.hasScreening),
      text: uploaded('screening', medical.hasScreening) ? t('تم الرفع', 'Uploaded') : t('لم يُرفع', 'Not uploaded'),
    }] : []),
    {
      key: 'questions', Icon: IconHeartPulse, label: t('الأسئلة الصحية', 'Health questions'),
      done: answered === medical.questions.length,
      text: t(`${toLatinDigits(answered)} من ${toLatinDigits(medical.questions.length)} تمت الإجابة`,
        `${answered} of ${medical.questions.length} answered`),
    },
    ...(medical.declarationsApply ? [{
      key: 'declarations', Icon: IconChecklist, label: t('الإقرارات', 'Declarations'),
      done: declared === declarationItems,
      text: t(`${toLatinDigits(declared)} من ${toLatinDigits(declarationItems)} مكتملة`, `${declared} of ${declarationItems} complete`),
    }] : []),
    ...(medical.guardianConsentApplies ? [{
      key: 'approvals', Icon: IconPlayers, label: t('الموافقات', 'Approvals'),
      done: approvalsDone === approvals.length,
      text: approvalsDone === approvals.length
        ? t('مكتملة', 'Complete')
        : t(`${toLatinDigits(approvalsDone)} من ${toLatinDigits(approvals.length)} مكتملة`, `${approvalsDone} of ${approvals.length} complete`),
    }] : []),
  ];

  return (
    <ul className="rg-status">
      {items.map((item) => (
        <li key={item.key}>
          <span className="rg-status__label"><item.Icon aria-hidden="true" />{item.label}</span>
          <span className={`rg-chip ${item.done ? 'is-ok' : 'is-open'}`}>
            {item.done ? <IconCheck aria-hidden="true" /> : <IconInfo aria-hidden="true" />}
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
