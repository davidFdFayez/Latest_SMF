import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconBracket, IconChevron, IconFemale, IconMale } from '../icons/Icons';
import { toLatinDigits } from '../../utils/format';
import { fetchPublishedDraw } from '../../api/services';
import PublicBracket from './PublicBracket';

/* ISOLATED TEST ONLY: the Draft preview exists only in a build made with VITE_SMTF_DRAW_PREVIEW=1 (the isolated
   start script). In any other build this is the constant `false`, the branch below is removed, and the preview
   module is never bundled. Even when present it needs ?preview=draft and an admin token held by the isolated
   dev server — see drawPreview.isolatedOnly.js. */
const PREVIEW_BUILD = import.meta.env.VITE_SMTF_DRAW_PREVIEW === '1';

const genderOf = (d) => (String(d.genderEn).toLowerCase() === 'female' ? 'female' : 'male');
const groupKey = (d) => `${d.genderEn}|${d.categoryEn}`;

/**
 * The tournament's Draw tab, in two views.
 *
 * View 1, the division list: one gender at a time — the same Male / Female
 * pills as Divisions & Weights — then that gender's age categories (each an
 * expandable group) and their weights, each weight a button. No bracket is
 * drawn here.
 *
 * View 2, the bracket: choosing a division replaces the whole list with that
 * division's bracket, full width; the small arrow beside its title goes back.
 * The gender and the open division are in the URL (?section=draw&gender=female
 * &division=163), so refreshing, sharing the link and the browser's
 * Back/Forward all land on the same view, with the same gender.
 *
 * A bracket is shown only when its draw is published; every other division
 * reads "لم تُنشر القرعة بعد". Drafts never reach the public site.
 */
export default function TournamentDraw({ tournamentId, divisions, ar }) {
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get('division')) || null;
  const preview = PREVIEW_BUILD && params.get('preview') === 'draft';
  const selected = selectedId ? divisions.find((d) => d.id === selectedId) : null;
  const hasMale = divisions.some((d) => genderOf(d) === 'male');
  // The same default as Divisions & Weights: Male when the tournament has any, otherwise Female.
  const gender = ['male', 'female'].includes(params.get('gender')) ? params.get('gender') : selected ? genderOf(selected) : hasMale || !divisions.length ? 'male' : 'female';
  // Which age groups are open in the list, kept while the visitor goes to a bracket and back.
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [lastViewed, setLastViewed] = useState(null);
  const top = useRef(null);

  const chooseGender = (g) => {
    const next = new URLSearchParams(params);
    next.set('gender', g);
    setParams(next, { replace: true }); // a filter, not a page: no history entry per click
  };
  const open = (division) => {
    const next = new URLSearchParams(params);
    next.set('section', 'draw');
    next.set('gender', genderOf(division));
    next.set('division', String(division.id));
    setParams(next); // a new history entry: Back returns to the list
    setLastViewed(division.id);
  };
  const back = () => {
    const next = new URLSearchParams(params);
    next.delete('division');
    next.set('gender', gender); // the list returns on the division's gender
    setParams(next);
  };

  // Each view starts at the top of the Draw tab.
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, [selectedId]);

  // Re-open the group of a division reached directly (link or refresh), so Back shows it.
  useEffect(() => {
    if (selected) setOpenGroups((s) => new Set(s).add(groupKey(selected)));
  }, [selected]);

  return (
    <section className="tsection tdraw" aria-labelledby="tdraw-title" ref={top}>
      {selectedId ? (
        <DrawView
          key={selectedId}
          tournamentId={tournamentId}
          division={selected}
          divisionId={selectedId}
          preview={preview}
          ar={ar}
          onBack={back}
        />
      ) : (
        <DivisionList
          preview={preview}
          divisions={divisions}
          gender={gender}
          onGender={chooseGender}
          ar={ar}
          onOpen={open}
          openGroups={openGroups}
          setOpenGroups={setOpenGroups}
          lastViewed={lastViewed}
        />
      )}
    </section>
  );
}

/** Isolated test only: says the page is a preview. Placed under each view's heading, so the heading keeps its place under the tabs. */
function PreviewBanner({ ar }) {
  const pick = (arabic, english) => (ar ? arabic : english);
  return (
    <p className="tdraw-preview-banner" role="note">
      <strong>{pick('وضع المعاينة — بيئة اختبار معزولة فقط', 'Preview mode — isolated test environment only')}</strong>
      <span>
        {pick(
          'تُعرض هنا مسودات القرعة غير المنشورة للمراجعة فقط، ولا تظهر للجمهور.',
          'Unpublished Draft draws are shown here for review only; the public never sees them.',
        )}
      </span>
    </p>
  );
}

/* ── View 1 ─────────────────────────────────────────────────────────────── */

function DivisionList({ preview, divisions, gender, onGender, ar, onOpen, openGroups, setOpenGroups, lastViewed }) {
  const pick = (arabic, english) => (ar ? arabic : english);
  const unit = ar ? 'كجم' : 'kg';

  // The selected gender's age categories → weights, in the same category order as Divisions & Weights:
  // Masters, Elite, then the youth categories youngest to oldest; lightest weight first.
  const groups = useMemo(() => {
    const band = (c) => (/^masters/i.test(c) ? 0 : /^elite$/i.test(c) ? 1 : 2);
    const out = [];
    for (const d of divisions.filter((x) => genderOf(x) === gender)) {
      let group = out.find((x) => x.key === groupKey(d));
      if (!group) {
        group = { key: groupKey(d), category: d.categoryEn, name: pick(d.categoryAr, d.categoryEn), weights: [] };
        out.push(group);
      }
      group.weights.push(d);
    }
    return out.sort((a, b) => band(a.category) - band(b.category));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions, gender, ar]);

  const toggle = (key) =>
    setOpenGroups((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // The same pills as Divisions & Weights (TournamentDivisions), with its own classes.
  const options = [
    { key: 'male', label: pick('ذكور', 'Male'), Icon: IconMale },
    { key: 'female', label: pick('إناث', 'Female'), Icon: IconFemale },
  ];

  return (
    <>
      <div className="tdraw-list__head">
        <h2 id="tdraw-title" className="tsection__title">{pick('القرعة', 'Draw')}</h2>
        <p className="tdraw-list__intro">
          {pick('اختر الفئة والوزن لعرض جدول القرعة.', 'Choose a category and weight to see its draw.')}
          <span className="tdraw-list__count">
            {pick(`${toLatinDigits(divisions.length)} قسمًا`, `${divisions.length} divisions`)}
          </span>
        </p>
      </div>
      {preview && <PreviewBanner ar={ar} />}
      <div className="tpage-card tdiv__card tdraw-list">
        <div className="tdiv__genders" role="group" aria-label={pick('الجنس', 'Gender')}>
          {options.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`tdiv__gender${gender === key ? ' is-active' : ''}`}
              aria-pressed={gender === key}
              onClick={() => onGender(key)}
            >
              <Icon className="tdiv__gender-icon" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {groups.length === 0 ? (
          <p className="tdiv__empty">
            {gender === 'male'
              ? pick('لا توجد فئات للذكور في هذه البطولة.', 'This tournament has no male divisions.')
              : pick('لا توجد فئات للإناث في هذه البطولة.', 'This tournament has no female divisions.')}
          </p>
        ) : (
          <ul className="tdraw-groups">
            {groups.map((group) => {
              const isOpen = openGroups.has(group.key);
              const published = group.weights.filter((w) => w.drawPublished).length;
              const panel = `tdraw-group-${group.key.replace(/[^a-z0-9]+/gi, '-')}`;
              return (
                <li key={group.key} className={`tdraw-group${isOpen ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="tdraw-group__toggle"
                    aria-expanded={isOpen}
                    aria-controls={panel}
                    onClick={() => toggle(group.key)}
                  >
                    <span className="tdraw-group__name">{group.name}</span>
                    <span className="tdraw-group__meta">
                      {pick(
                        `${toLatinDigits(group.weights.length)} أوزان · ${toLatinDigits(published)} منشورة`,
                        `${group.weights.length} weights · ${published} published`,
                      )}
                    </span>
                    <IconChevron className="tdraw-group__chevron" aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <ul className="tdraw-weights" id={panel}>
                      {group.weights.map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            className={`tdraw-weight${d.drawPublished ? ' is-published' : ''}${lastViewed === d.id ? ' is-last' : ''}`}
                            aria-current={lastViewed === d.id ? 'true' : undefined}
                            onClick={() => onOpen(d)}
                          >
                            <span className="tdraw-weight__kg">
                              <bdi>{toLatinDigits(String(d.weightEn).replace(/\s*kg$/i, ''))}</bdi> {unit}
                            </span>
                            <span className="tdraw-weight__status">
                              {d.drawPublished ? pick('عرض القرعة', 'View draw') : pick('لم تُنشر القرعة بعد', 'Not published yet')}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

/* ── View 2 ─────────────────────────────────────────────────────────────── */

function DrawView({ tournamentId, division, divisionId, preview, ar, onBack }) {
  const pick = (arabic, english) => (ar ? arabic : english);
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The public rule first: a published draw comes from the public endpoint.
        const published = await fetchPublishedDraw(tournamentId, divisionId);
        if (!cancelled) setState({ draw: published, status: 'published', photos: `/api/events/tournament-${tournamentId}/divisions/${divisionId}/draw/photo` });
        return;
      } catch (error) {
        if (error?.response?.status !== 404) {
          if (!cancelled) setState({ error: true });
          return;
        }
      }
      // ISOLATED TEST ONLY — removed from every other build (see PREVIEW_BUILD).
      if (PREVIEW_BUILD && preview) {
        const { fetchDraftPreview, previewPhotoBase } = await import('./drawPreview.isolatedOnly');
        const draft = await fetchDraftPreview(tournamentId, divisionId);
        if (!cancelled && draft) {
          setState({ draw: draft.draw, status: draft.status, preview: true, photos: previewPhotoBase(tournamentId, divisionId) });
          return;
        }
      }
      if (!cancelled) setState({ notPublished: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId, divisionId, preview]);

  const title = division
    ? [pick(division.genderAr, division.genderEn), pick(division.categoryAr, division.categoryEn), pick(division.weightAr, division.weightEn)].join(' — ')
    : pick('قسم غير معروف', 'Unknown division');
  const athletes = state.draw?.athletes;
  const bouts = state.draw ? state.draw.rounds.reduce((n, r) => n + r.bouts.filter((b) => !b.isBye).length, 0) : null;
  const backLabel = pick('العودة إلى جميع الأقسام', 'Back to all divisions');

  return (
    <div className="tdraw-view">
      <div className="tdraw-view__bar">
        <div className="tdraw-view__heading">
          {/* A plain arrow, no box: it points back the way the page reads (→ in Arabic, ← in English). */}
          <button type="button" className="tdraw-back" onClick={onBack} aria-label={backLabel} title={backLabel}>
            <svg className="tdraw-back__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 id="tdraw-title" className="tdraw-view__name">{title}</h2>
        </div>
        <p className="tdraw-view__meta">
          {athletes != null && <span>{pick(`عدد المشاركين: ${toLatinDigits(athletes)}`, `${athletes} athletes`)}</span>}
          {state.draw && (
            <span>
              {pick(`${toLatinDigits(bouts)} نزالًا · ${toLatinDigits(state.draw.totalRounds)} أدوار`, `${bouts} bouts · ${state.draw.totalRounds} rounds`)}
            </span>
          )}
          {state.preview && <span className="tdraw-view__draft">{pick('مسودة — معاينة اختبار فقط', 'Draft — test preview only')}</span>}
        </p>
      </div>
      {preview && <PreviewBanner ar={ar} />}

      {state.loading && <p className="tdraw-view__status">{pick('جارٍ تحميل القرعة…', 'Loading the draw…')}</p>}
      {state.error && (
        <div className="tpage-card tsection__placeholder">
          <p>{pick('تعذّر تحميل القرعة. حاول مرة أخرى لاحقًا.', 'The draw could not be loaded. Please try again later.')}</p>
        </div>
      )}
      {state.notPublished && (
        <div className="tpage-card tsection__placeholder tdraw-view__empty">
          <IconBracket className="tsection__placeholder-icon" aria-hidden="true" />
          <p>{pick('لم تُنشر القرعة بعد', 'The draw has not been published yet.')}</p>
        </div>
      )}
      {state.draw && <PublicBracket draw={state.draw} photos={state.photos} ar={ar} />}
    </div>
  );
}
