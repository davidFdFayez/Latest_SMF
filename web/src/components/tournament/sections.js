import { IconBracket, IconCalendar, IconDocument, IconInfoCircle, IconScales, IconTrophy } from '../icons/Icons';

/**
 * The tournament page's sections, in tab order. The tournament's milestones
 * (registration, medical examination, competition days) live in Overview's
 * Key Dates; "schedule" is the Match Schedule — the bouts, once drawn and
 * scheduled. Its key stays "schedule" so existing ?section= links still work.
 */
export const TOURNAMENT_SECTIONS = [
  { key: 'overview', ar: 'نظرة عامة', en: 'Overview', Icon: IconInfoCircle },
  { key: 'divisions', ar: 'الفئات والأوزان', en: 'Divisions & Weights', Icon: IconScales },
  { key: 'terms', ar: 'الشروط والأحكام', en: 'Terms & Conditions', Icon: IconDocument },
  { key: 'draw', ar: 'القرعة', en: 'Draw', Icon: IconBracket },
  { key: 'schedule', ar: 'جدول المباريات', en: 'Match Schedule', Icon: IconCalendar },
  { key: 'results', ar: 'النتائج', en: 'Results', Icon: IconTrophy },
];
