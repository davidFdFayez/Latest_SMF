import { AlertIcon, CheckIcon, InfoIcon } from './Icons'

/**
 * A division's athletes and the freshness of its saved draw, as compact
 * counters in the existing status-badge style and one short message — the
 * same in the Draw Management overview, the division (draft review) page and
 * the bracket page.
 *
 * Freshness is the server's comparison of exact athlete identities (the
 * saved draw's round-one entries against the entries eligible now), passed in
 * as `changed`; counts are never compared here. Labels follow the page
 * language (English, or Arabic when the document's lang is "ar"); the layout
 * uses logical properties, so it mirrors correctly right-to-left.
 */
const TEXT = {
  en: {
    participants: 'Participants',
    eligible: 'Eligible',
    notEligible: 'Not Eligible',
    savedDraft: 'Saved Draft',
    savedDraw: 'Published Draw',
    current: 'Draw is up to date — No regeneration needed',
    outdated: 'Draw outdated — Regeneration required',
    none: 'No draw created',
    review: 'Review changes',
    hide: 'Hide changes',
    regenerate: 'Regenerate Draft…',
    viewDetails: 'View eligibility details',
    hideDetails: 'Hide eligibility details',
  },
  ar: {
    participants: 'المشاركون',
    eligible: 'المؤهلون',
    notEligible: 'غير المؤهلين',
    savedDraft: 'المسودة المحفوظة',
    savedDraw: 'القرعة المنشورة',
    current: 'القرعة محدّثة — لا حاجة لإعادة الإنشاء',
    outdated: 'القرعة غير محدّثة — يلزم إعادة الإنشاء',
    none: 'لم تُنشأ قرعة',
    review: 'مراجعة التغييرات',
    hide: 'إخفاء التغييرات',
    regenerate: 'إعادة إنشاء المسودة…',
    viewDetails: 'عرض تفاصيل الأهلية',
    hideDetails: 'إخفاء تفاصيل الأهلية',
  },
}

export function drawText() {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang || '' : ''
  return lang.toLowerCase().startsWith('ar') ? TEXT.ar : TEXT.en
}

/** 'none' (no draw), 'current' (same athletes) or 'outdated' (different athletes), from the server's identity check. */
export function drawFreshness(hasDraw, changed) {
  if (!hasDraw) return 'none'
  return changed ? 'outdated' : 'current'
}

const ICON = { current: CheckIcon, outdated: AlertIcon, none: InfoIcon }

export default function DrawStatusSummary({
  participants,
  eligible,
  saved,
  hasDraw,
  published = false,
  changed,
  actions,
}) {
  const t = drawText()
  const notEligible = Math.max(0, participants - eligible)
  const freshness = drawFreshness(hasDraw, changed)
  const Icon = ICON[freshness]
  return (
    <div className="dsum" data-testid="draw-status-summary" data-freshness={freshness}>
      <div className="dsum__badges">
        <span className="dm-status dm-status--neutral" data-count="participants">
          {t.participants}: <strong>{participants}</strong>
        </span>
        <span className="dm-status dm-status--green" data-count="eligible">
          {t.eligible}: <strong>{eligible}</strong>
        </span>
        {notEligible > 0 && (
          <span className="dm-status dm-status--amber" data-count="not-eligible">
            {t.notEligible}: <strong>{notEligible}</strong>
          </span>
        )}
        {hasDraw && (
          <span className="dm-status dm-status--blue" data-count="saved">
            {published ? t.savedDraw : t.savedDraft}: <strong>{saved}</strong>
          </span>
        )}
      </div>
      <p className={`dsum__msg dsum__msg--${freshness}`} role="status" data-testid="draw-freshness">
        <Icon aria-hidden="true" />
        <span>{t[freshness]}</span>
        {actions}
      </p>
    </div>
  )
}
