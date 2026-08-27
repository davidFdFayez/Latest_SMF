/**
 * Configuration behind the SMF registration portal.
 *
 * Everything the wizard renders — the categories, the fields on each step, the
 * documents each category must attach — is declared here so that validation,
 * the review summary, and the submitted payload all read from one source and
 * cannot drift apart.
 *
 * Data standards intake follows (REG-02), identically on every form:
 *   phone        E.164            +966XXXXXXXXX
 *   nationality  ISO 3166-1       alpha-2 code
 *   dates        ISO 8601         YYYY-MM-DD
 *   names        three parts      given / father / family, Arabic *and* English
 *
 * Field shape:
 *   name       form key, and the key sent to the API
 *   label      { ar, en }
 *   control    text | email | phone | date | number | select | radio | textarea
 *   required   true, or a predicate (values) => boolean for conditional fields
 *   when       predicate (values) => boolean controlling visibility
 *   span       column span out of 12 on desktop
 *   validate   key into the validator table in pages/Registration.jsx
 */

import { COUNTRIES, countriesFor } from './countries'

export const REGISTRATION_TYPES = [
  {
    key: 'athlete',
    route: 'athlete',
    label: { ar: 'لاعب', en: 'Athlete' },
    blurb: {
      ar: 'تسجيل الرياضيين ببيانات الهوية والتواصل والنادي والمدرب والوزن الحالي.',
      en: 'Athlete registration covering identity, contact, club, coach, and current weight.',
    },
  },
  {
    key: 'coach',
    route: 'coach',
    label: { ar: 'مدرب', en: 'Coach' },
    blurb: {
      ar: 'تسجيل المدربين مع بيانات الخبرة والعمل والشهادات التدريبية إن وجدت.',
      en: 'Coach registration with experience, workplace, and coaching certificates if held.',
    },
  },
  {
    key: 'official',
    route: 'official',
    label: { ar: 'حكم', en: 'Referee' },
    blurb: {
      ar: 'تسجيل الحكام مع التصنيف والخبرة التحكيمية والدورات والمشاركات السابقة.',
      en: 'Referee registration with grade, officiating experience, courses, and past appearances.',
    },
  },
  {
    key: 'club',
    route: 'club',
    label: { ar: 'نادٍ / منشأة', en: 'Club / Facility' },
    blurb: {
      ar: 'تسجيل الأندية والمراكز والأكاديميات مع بيانات المالك والمدرب والمرفقات الأساسية.',
      en: 'Club, centre, and academy registration with owner, coach, and core licence documents.',
    },
  },
]

/** URL segments that should resolve to a category (the portal says "referee", the API stores "official"). */
export const TYPE_ROUTE_ALIASES = {
  athlete: 'athlete',
  coach: 'coach',
  club: 'club',
  official: 'official',
  referee: 'official',
}

export const STEPS = [
  { key: 'type', label: { ar: 'نوع التسجيل', en: 'Category' } },
  { key: 'identity', label: { ar: 'البيانات الأساسية', en: 'Basic details' } },
  { key: 'contact', label: { ar: 'التواصل', en: 'Contact' } },
  { key: 'details', label: { ar: 'التفاصيل', en: 'Category details' } },
  { key: 'review', label: { ar: 'المرفقات والمراجعة', en: 'Documents & review' } },
]

const REGION_NAMES = [
  ['منطقة الرياض', 'Riyadh Region'],
  ['منطقة مكة المكرمة', 'Makkah Region'],
  ['منطقة المدينة المنورة', 'Madinah Region'],
  ['المنطقة الشرقية', 'Eastern Province'],
  ['منطقة القصيم', 'Qassim Region'],
  ['منطقة عسير', 'Asir Region'],
  ['منطقة تبوك', 'Tabuk Region'],
  ['منطقة حائل', 'Hail Region'],
  ['منطقة الحدود الشمالية', 'Northern Borders Region'],
  ['منطقة جازان', 'Jazan Region'],
  ['منطقة نجران', 'Najran Region'],
  ['منطقة الباحة', 'Al Bahah Region'],
  ['منطقة الجوف', 'Al Jouf Region'],
]

export const REGIONS = REGION_NAMES.map(([ar, en]) => ({ value: ar, ar, en }))

/**
 * REG-07 — the old fixed Gulf/Arab list plus an inert "Other" option locked
 * out every unlisted nationality. The picker now offers the complete ISO
 * 3166-1 list and stores the alpha-2 code.
 */
const NATIONALITY_OPTIONS = countriesFor('ar').map((country) => ({
  value: country.code,
  ar: country.ar,
  en: country.en,
}))

/** English-ordered variant; the field control picks whichever matches the UI language. */
const NATIONALITY_OPTIONS_EN = countriesFor('en').map((country) => ({
  value: country.code,
  ar: country.ar,
  en: country.en,
}))

const DOCUMENT_TYPES = [
  { value: 'national_id', ar: 'هوية وطنية سعودية', en: 'Saudi national ID' },
  { value: 'iqama', ar: 'إقامة', en: 'Iqama (residency)' },
  { value: 'passport', ar: 'جواز سفر', en: 'Passport' },
  { value: 'gcc_id', ar: 'هوية دول مجلس التعاون', en: 'GCC national ID' },
]

const YES_NO = [
  { value: 'yes', ar: 'نعم', en: 'Yes' },
  { value: 'no', ar: 'لا', en: 'No' },
]

/* ── age, eligibility, and category (REG-05) ─────────────────────────────── */

/** Age in whole years, or null when the date of birth is absent or unparseable. */
export function ageFrom(dateOfBirth) {
  if (!dateOfBirth) return null
  const birth = new Date(dateOfBirth)
  if (Number.isNaN(birth.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDelta = today.getMonth() - birth.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1
  return age
}

/**
 * Eligible age window per category (REG-05). An athlete registers from 6 to
 * 45; a coach or a referee must be an adult.
 */
export const AGE_LIMITS = {
  athlete: { min: 6, max: 45 },
  coach: { min: 18, max: 80 },
  official: { min: 18, max: 80 },
}

/** §10 — an athlete under 18 needs a guardian on the request and a signed consent. */
export const isMinor = (values) => {
  const age = ageFrom(values.dateOfBirth)
  return age !== null && age < 18
}

export const isPara = (values) => values.paraAthlete === 'yes'

/**
 * Competition categories the auto-calculation can assign.
 *
 * The Junior / Youth / Senior bands follow the IFMA age groups. "Elite" covers
 * the remaining years up to the federation's own 45 upper limit, and "Para" is
 * driven by the declared para classification rather than by age. The value is
 * pre-filled but stays editable, because the federation reviews and may amend
 * the category before a registration is approved.
 */
export const ATHLETE_CATEGORIES = [
  { value: 'junior', ar: 'ناشئ', en: 'Junior', minAge: 6, maxAge: 13 },
  { value: 'youth', ar: 'شباب', en: 'Youth', minAge: 14, maxAge: 17 },
  { value: 'senior', ar: 'كبار', en: 'Senior', minAge: 18, maxAge: 40 },
  { value: 'elite', ar: 'نخبة', en: 'Elite', minAge: 41, maxAge: 45 },
  { value: 'para', ar: 'بارا مواي تاي', en: 'Para', minAge: 6, maxAge: 45 },
]

/**
 * IFMA weight divisions, as the upper limit of each class. Anything above the
 * last limit is the open ("+") class.
 */
const WEIGHT_DIVISIONS = {
  male: [45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, 81, 86, 91],
  female: [45, 48, 51, 54, 57, 60, 63.5, 67, 71],
}

/** Plausible competition weight for the age band (REG-11). */
export function weightRangeFor(values) {
  const age = ageFrom(values.dateOfBirth)
  if (age === null) return { min: 20, max: 150 }
  if (age <= 13) return { min: 20, max: 80 }
  if (age <= 17) return { min: 28, max: 110 }
  return { min: 40, max: 150 }
}

/** Division label for the athlete's gender and current weight, or ''. */
export function weightDivisionFor(values) {
  const weight = Number(values.currentWeight)
  if (!Number.isFinite(weight) || weight <= 0) return ''

  const limits = WEIGHT_DIVISIONS[values.gender === 'female' ? 'female' : 'male']
  const limit = limits.find((entry) => weight <= entry)
  return limit ? `-${limit} kg` : `+${limits[limits.length - 1]} kg`
}

/**
 * Category implied by age, weight, and gender. Returns '' while the inputs the
 * calculation needs are still missing.
 */
export function categoryFor(values) {
  if (isPara(values)) return 'para'

  const age = ageFrom(values.dateOfBirth)
  if (age === null) return ''
  if (!weightDivisionFor(values)) return ''

  const band = ATHLETE_CATEGORIES.find(
    (entry) => entry.value !== 'para' && age >= entry.minAge && age <= entry.maxAge,
  )
  return band ? band.value : ''
}

/* ── shared field builders ───────────────────────────────────────────────── */

const NAME_PARTS = [
  { key: 'firstName', ar: 'الاسم الأول', en: 'First name' },
  { key: 'fatherName', ar: 'اسم الأب', en: 'Second (father) name' },
  { key: 'familyName', ar: 'اسم العائلة', en: 'Family name' },
]

/**
 * REG-03/REG-04 — six separate, required name parts. One combined free-text
 * "full name" accepted a single word such as "Ali" and Latin text inside the
 * Arabic field; three labelled parts per script make both impossible.
 */
function personNameFields(contextAr = '', contextEn = '') {
  return [
    ...NAME_PARTS.map((part) => ({
      name: `${part.key}Ar`,
      label: { ar: `${part.ar}${contextAr} (بالعربية)`, en: `${part.en}${contextEn} (Arabic)` },
      required: true,
      span: 4,
      dir: 'rtl',
      validate: 'arabicName',
    })),
    ...NAME_PARTS.map((part) => ({
      name: `${part.key}En`,
      label: { ar: `${part.ar}${contextAr} (بالإنجليزية)`, en: `${part.en}${contextEn} (English)` },
      required: true,
      span: 4,
      dir: 'ltr',
      validate: 'latinName',
    })),
  ]
}

const nationalityField = {
  name: 'nationality',
  label: { ar: 'الجنسية', en: 'Nationality' },
  control: 'select',
  options: NATIONALITY_OPTIONS,
  optionsEn: NATIONALITY_OPTIONS_EN,
  required: true,
  span: 6,
  hint: { ar: 'تُحفظ وفق معيار ISO 3166-1.', en: 'Stored as an ISO 3166-1 alpha-2 code.' },
}

/** Phone control — dial-code selector plus national number, stored as E.164. */
const phoneField = (name, label, extra = {}) => ({
  name,
  label,
  control: 'phone',
  span: 6,
  dir: 'ltr',
  validate: 'phone',
  ...extra,
})

function identityFieldsFor(type) {
  return [
    ...personNameFields(),
    {
      name: 'documentType',
      label: { ar: 'نوع الوثيقة', en: 'Document type' },
      control: 'select',
      options: DOCUMENT_TYPES,
      required: true,
      span: 4,
    },
    {
      name: 'nationalId',
      label: { ar: 'رقم الهوية / الإقامة / الجواز', en: 'National ID / Iqama / Passport number' },
      required: true,
      span: 4,
      dir: 'ltr',
      validate: 'nationalId',
    },
    {
      name: 'dateOfBirth',
      label: { ar: 'تاريخ الميلاد', en: 'Date of birth' },
      control: 'date',
      required: true,
      span: 4,
      validate: `dob_${type}`,
      hint:
        type === 'athlete'
          ? { ar: 'العمر المقبول للتسجيل من 6 إلى 45 سنة.', en: 'Eligible age for registration is 6 to 45.' }
          : { ar: 'يجب ألا يقل العمر عن 18 سنة.', en: 'Must be 18 or older.' },
    },
    nationalityField,
    {
      name: 'gender',
      label: { ar: 'الجنس', en: 'Gender' },
      control: 'radio',
      options: [
        { value: 'male', ar: 'ذكر', en: 'Male' },
        { value: 'female', ar: 'أنثى', en: 'Female' },
      ],
      required: true,
      span: 6,
    },
  ]
}

const contactFields = [
  phoneField('phone', { ar: 'رقم الجوال', en: 'Mobile number' }, { required: true }),
  { name: 'email', label: { ar: 'البريد الإلكتروني', en: 'Email address' }, control: 'email', required: true, span: 6, dir: 'ltr', validate: 'email', placeholder: 'name@example.com' },
  { name: 'region', label: { ar: 'المنطقة', en: 'Region' }, control: 'select', options: REGIONS, required: true, span: 6 },
  { name: 'city', label: { ar: 'المدينة', en: 'City' }, required: true, span: 6 },
]

const guardianFields = [
  {
    name: 'guardianName',
    label: { ar: 'اسم ولي الأمر', en: 'Guardian name' },
    required: isMinor,
    when: isMinor,
    span: 4,
  },
  phoneField(
    'guardianPhone',
    { ar: 'رقم جوال ولي الأمر', en: 'Guardian mobile' },
    { required: isMinor, when: isMinor, span: 4 },
  ),
  {
    name: 'guardianRelation',
    label: { ar: 'صلة القرابة', en: 'Relationship' },
    control: 'select',
    options: [
      { value: 'father', ar: 'الأب', en: 'Father' },
      { value: 'mother', ar: 'الأم', en: 'Mother' },
      { value: 'legal_guardian', ar: 'الوصي القانوني', en: 'Legal guardian' },
      { value: 'other', ar: 'أخرى', en: 'Other' },
    ],
    required: isMinor,
    when: isMinor,
    span: 4,
  },
]

/** True once the referee says they have officiated at least one tournament. */
const hasOfficiated = (values) => Number(values.tournamentsCount) > 0

/** Field sets per category and step. */
export const FIELDS = {
  athlete: {
    identity: identityFieldsFor('athlete'),
    contact: contactFields,
    details: [
      { name: 'clubName', label: { ar: 'النادي أو المركز الذي يتدرب فيه اللاعب', en: 'Club or centre where the athlete trains' }, span: 4 },
      { name: 'coachName', label: { ar: 'اسم المدرب', en: 'Coach name' }, span: 4 },
      phoneField('coachPhone', { ar: 'رقم جوال المدرب', en: 'Coach mobile' }, { span: 4 }),
      {
        name: 'currentWeight',
        label: { ar: 'الوزن الحالي (كجم)', en: 'Current weight (kg)' },
        control: 'number',
        required: true,
        span: 4,
        dir: 'ltr',
        validate: 'weight',
        step: '0.1',
      },
      { name: 'height', label: { ar: 'الطول (سم)', en: 'Height (cm)' }, control: 'number', span: 4, dir: 'ltr' },
      {
        name: 'paraAthlete',
        label: { ar: 'هل التسجيل في فئة بارا مواي تاي؟', en: 'Registering in Para Muaythai?' },
        control: 'radio',
        options: YES_NO,
        required: true,
        span: 4,
      },
      {
        name: 'paraClassification',
        label: { ar: 'التصنيف البارالمبي', en: 'Para classification' },
        span: 6,
        when: isPara,
        required: isPara,
        hint: { ar: 'مثال: إعاقة بصرية، بتر طرف.', en: 'For example: visual impairment, limb deficiency.' },
      },
      {
        name: 'athleteCategory',
        label: { ar: 'الفئة التنافسية', en: 'Competition category' },
        control: 'select',
        options: ATHLETE_CATEGORIES.map(({ value, ar, en }) => ({ value, ar, en })),
        required: true,
        span: 6,
        hint: {
          ar: 'تُحتسب تلقائياً من العمر والوزن والجنس، وقابلة للتعديل من الاتحاد بعد المراجعة.',
          en: 'Calculated automatically from age, weight, and gender; the federation may amend it after review.',
        },
      },
      { name: 'sector', label: { ar: 'القطاع', en: 'Sector' }, span: 4, hint: { ar: 'يُستخدم لخطابات التفريغ والإحصائيات.', en: 'Used for release letters and statistics.' } },
      ...guardianFields,
      { name: 'socialMedia', label: { ar: 'حسابات التواصل الاجتماعي', en: 'Social media accounts' }, span: 6, dir: 'ltr' },
      { name: 'cvUrl', label: { ar: 'رابط السيرة الذاتية', en: 'CV link' }, span: 6, dir: 'ltr', validate: 'url' },
    ],
  },

  coach: {
    identity: identityFieldsFor('coach'),
    contact: contactFields,
    details: [
      { name: 'clubName', label: { ar: 'النادي أو المركز الذي يعمل فيه المدرب', en: 'Club or centre where the coach works' }, span: 4 },
      {
        name: 'affiliationStatus',
        label: { ar: 'حالة الارتباط', en: 'Affiliation' },
        control: 'select',
        options: [
          { value: 'club', ar: 'مدرب في نادي / مركز', en: 'Club or centre coach' },
          { value: 'independent', ar: 'مستقل', en: 'Independent' },
          { value: 'collaborator', ar: 'متعاون', en: 'Collaborator' },
        ],
        span: 4,
      },
      { name: 'yearsExperience', label: { ar: 'سنوات الخبرة التدريبية', en: 'Years of coaching experience' }, control: 'number', span: 4, dir: 'ltr' },
      { name: 'categoriesCoached', label: { ar: 'الفئات التي يدربها', en: 'Categories coached' }, span: 6, placeholder: 'رجال، ناشئين' },
      { name: 'coachingLevel', label: { ar: 'المستوى التدريبي', en: 'Coaching level' }, span: 6 },
      {
        name: 'attendedFederationCourses',
        label: { ar: 'هل سبق حضور دورات تدريبية تابعة للاتحاد؟', en: 'Attended federation coaching courses?' },
        control: 'radio',
        options: YES_NO,
        span: 6,
      },
      { name: 'externalCertificates', label: { ar: 'الشهادات الخارجية أو الدولية', en: 'External or international certificates' }, span: 6 },
      { name: 'previousClubs', label: { ar: 'الأندية أو الجهات التي سبق التدريب فيها', en: 'Previous clubs or organisations' }, span: 6 },
      { name: 'socialMedia', label: { ar: 'حسابات التواصل الاجتماعي', en: 'Social media accounts' }, span: 6, dir: 'ltr' },
      { name: 'cvUrl', label: { ar: 'رابط السيرة الذاتية', en: 'CV link' }, span: 6, dir: 'ltr', validate: 'url' },
      { name: 'notes', label: { ar: 'ملاحظات إضافية', en: 'Additional notes' }, control: 'textarea', span: 12 },
    ],
  },

  official: {
    identity: identityFieldsFor('official'),
    contact: contactFields,
    details: [
      {
        name: 'refereeGrade',
        label: { ar: 'تصنيف الحكم', en: 'Referee grade' },
        control: 'select',
        options: [
          { value: 'entry', ar: 'مستجد', en: 'Entry level' },
          { value: 'third', ar: 'درجة ثالثة', en: 'Third grade' },
          { value: 'second', ar: 'درجة ثانية', en: 'Second grade' },
          { value: 'first', ar: 'درجة أولى', en: 'First grade' },
          { value: 'international', ar: 'دولي', en: 'International' },
        ],
        required: true,
        span: 4,
        hint: {
          ar: 'التصنيف مبدئي وقابل للتعديل من الاتحاد بعد المراجعة، ولا يُعد اعتماداً نهائياً.',
          en: 'Provisional only — the federation may amend the grade after review; it is not a final accreditation.',
        },
      },
      // REG-05: the officiating record is what the referees committee reviews,
      // so none of it may be left blank. The two "most recent appearance"
      // fields only apply once the referee has actually officiated.
      { name: 'refereeStartDate', label: { ar: 'تاريخ بداية التحكيم مع الاتحاد', en: 'Officiating start date with SMF' }, control: 'date', required: true, span: 4 },
      { name: 'yearsExperience', label: { ar: 'سنوات الخبرة في التحكيم', en: 'Years of officiating experience' }, control: 'number', required: true, span: 4, dir: 'ltr' },
      { name: 'tournamentsCount', label: { ar: 'عدد البطولات التي شارك فيها كحكم', en: 'Tournaments officiated' }, control: 'number', required: true, span: 6, dir: 'ltr' },
      { name: 'lastTournament', label: { ar: 'آخر بطولة شارك فيها كحكم', en: 'Most recent tournament officiated' }, span: 6, when: hasOfficiated, required: hasOfficiated },
      { name: 'lastRefereeingDate', label: { ar: 'تاريخ آخر مشاركة تحكيمية', en: 'Date of last officiating appearance' }, control: 'date', span: 6, when: hasOfficiated, required: hasOfficiated },
      { name: 'coursesAttended', label: { ar: 'الدورات التحكيمية التي حضرها', en: 'Refereeing courses attended' }, span: 6 },
    ],
  },

  club: {
    identity: [
      ...personNameFields(' لمقدم الطلب', ' (applicant)'),
      {
        name: 'applicantRole',
        label: { ar: 'صفة مقدم الطلب', en: 'Applicant capacity' },
        control: 'select',
        options: [
          { value: 'owner', ar: 'مالك النادي', en: 'Club owner' },
          { value: 'coach', ar: 'مدرب النادي', en: 'Club coach' },
          { value: 'authorized', ar: 'مفوض', en: 'Authorised representative' },
        ],
        required: true,
        span: 6,
      },
      { name: 'applicantId', label: { ar: 'رقم الهوية / الإقامة', en: 'National ID / Iqama' }, required: true, span: 6, dir: 'ltr', validate: 'nationalId' },
      { ...nationalityField, name: 'nationality', label: { ar: 'جنسية مقدم الطلب', en: 'Applicant nationality' } },
    ],
    contact: [
      phoneField('applicantPhone', { ar: 'رقم جوال مقدم الطلب', en: 'Applicant mobile' }, { required: true }),
      { name: 'applicantEmail', label: { ar: 'البريد الإلكتروني لمقدم الطلب', en: 'Applicant email' }, control: 'email', required: true, span: 6, dir: 'ltr', validate: 'email' },
      { name: 'officialEmail', label: { ar: 'البريد الإلكتروني الرسمي للنادي', en: 'Official club email' }, control: 'email', required: true, span: 6, dir: 'ltr', validate: 'email' },
      { name: 'region', label: { ar: 'المنطقة', en: 'Region' }, control: 'select', options: REGIONS, required: true, span: 6 },
      { name: 'city', label: { ar: 'المدينة', en: 'City' }, required: true, span: 6 },
      { name: 'district', label: { ar: 'الحي', en: 'District' }, required: true, span: 6 },
    ],
    details: [
      { name: 'nameAr', label: { ar: 'اسم النادي / المنشأة بالعربي', en: 'Club / facility name (Arabic)' }, required: true, span: 6, dir: 'rtl', validate: 'arabicText' },
      { name: 'nameEn', label: { ar: 'اسم النادي / المنشأة بالإنجليزي', en: 'Club / facility name (English)' }, required: true, span: 6, dir: 'ltr', validate: 'latinText' },
      {
        name: 'entityType',
        label: { ar: 'نوع الجهة', en: 'Entity type' },
        control: 'select',
        options: [
          { value: 'club', ar: 'نادي', en: 'Club' },
          { value: 'center', ar: 'مركز', en: 'Centre' },
          { value: 'academy', ar: 'أكاديمية', en: 'Academy' },
        ],
        required: true,
        span: 4,
      },
      { name: 'ownerName', label: { ar: 'اسم مالك النادي', en: 'Club owner name' }, required: true, span: 4 },
      { name: 'ownerId', label: { ar: 'رقم هوية المالك', en: 'Owner ID number' }, span: 4, dir: 'ltr' },
      phoneField('ownerPhone', { ar: 'رقم جوال المالك', en: 'Owner mobile' }),
      { name: 'ownerEmail', label: { ar: 'البريد الإلكتروني للمالك', en: 'Owner email' }, control: 'email', span: 6, dir: 'ltr', validate: 'email' },
      { name: 'headCoachName', label: { ar: 'اسم المدرب الأساسي', en: 'Head coach name' }, required: true, span: 6 },
      phoneField('headCoachPhone', { ar: 'رقم جوال المدرب الأساسي', en: 'Head coach mobile' }, { required: true, span: 6 }),
      { name: 'headCoachEmail', label: { ar: 'البريد الإلكتروني للمدرب', en: 'Head coach email' }, control: 'email', span: 6, dir: 'ltr', validate: 'email' },
      { name: 'headCoachCertificates', label: { ar: 'شهادات المدرب الأساسي', en: 'Head coach certificates' }, span: 6, hint: { ar: 'شهادات من الاتحاد أو شهادات أخرى.', en: 'Federation-issued or other certificates.' } },
      { name: 'shortAddress', label: { ar: 'العنوان المختصر', en: 'Short address' }, span: 4 },
      { name: 'googleMapsUrl', label: { ar: 'رابط الموقع على Google Maps', en: 'Google Maps link' }, span: 4, dir: 'ltr', validate: 'url' },
      { name: 'nationalAddress', label: { ar: 'العنوان الوطني', en: 'National address' }, span: 4, dir: 'ltr' },
      {
        name: 'hasBranches',
        label: { ar: 'هل يوجد أكثر من فرع؟', en: 'More than one branch?' },
        control: 'radio',
        options: YES_NO,
        span: 6,
      },
      {
        name: 'branchCount',
        label: { ar: 'عدد الفروع', en: 'Number of branches' },
        control: 'number',
        span: 6,
        dir: 'ltr',
        when: (v) => v.hasBranches === 'yes',
        required: (v) => v.hasBranches === 'yes',
      },
      {
        name: 'branchDetails',
        label: { ar: 'بيانات الفروع', en: 'Branch details' },
        control: 'textarea',
        span: 12,
        when: (v) => v.hasBranches === 'yes',
        hint: {
          ar: 'لكل فرع: الاسم، المدينة، الحي، رابط الخريطة، رقم التواصل، واسم المسؤول.',
          en: 'Per branch: name, city, district, map link, phone, and manager name.',
        },
      },
      {
        name: 'hasExtraCoaches',
        label: { ar: 'هل يوجد مدرب ثانٍ أو مدربون مساعدون؟', en: 'Second or assistant coaches?' },
        control: 'radio',
        options: YES_NO,
        span: 6,
      },
      {
        name: 'extraCoachDetails',
        label: { ar: 'بيانات المدربين الإضافيين', en: 'Additional coach details' },
        control: 'textarea',
        span: 12,
        when: (v) => v.hasExtraCoaches === 'yes',
        hint: {
          ar: 'لكل مدرب: الاسم، رقم الجوال، الدور أو التخصص، والشهادات التدريبية إن وجدت.',
          en: 'Per coach: name, mobile, role or speciality, and coaching certificates if any.',
        },
      },
      { name: 'approxAthletes', label: { ar: 'عدد اللاعبين التقريبي', en: 'Approximate number of athletes' }, control: 'number', span: 4, dir: 'ltr' },
      { name: 'categoriesAccepted', label: { ar: 'الفئات التي يستقبلها النادي', en: 'Categories accepted' }, span: 4, placeholder: 'رجال، نساء، ناشئين، أطفال' },
      { name: 'trainingSchedule', label: { ar: 'أيام وأوقات تدريب المواي تاي', en: 'Muaythai training days and times' }, span: 4 },
      {
        name: 'safetyEquipment',
        label: { ar: 'توفر أدوات السلامة والإسعافات الأولية', en: 'Safety equipment and first aid available' },
        control: 'radio',
        options: YES_NO,
        span: 6,
      },
      { name: 'clubWebsite', label: { ar: 'الموقع الإلكتروني للنادي', en: 'Club website' }, span: 6, dir: 'ltr', validate: 'url' },
      { name: 'clubSocialMedia', label: { ar: 'حسابات التواصل الاجتماعي للنادي', en: 'Club social media accounts' }, span: 12, dir: 'ltr' },
    ],
  },
}

/** Values pre-filled when a category is chosen. Nationality is an ISO alpha-2 code. */
export const DEFAULTS = {
  athlete: { nationality: 'SA', gender: 'male', paraAthlete: 'no' },
  coach: { nationality: 'SA', gender: 'male', affiliationStatus: 'club', attendedFederationCourses: 'no' },
  official: { nationality: 'SA', gender: 'male', refereeGrade: 'entry' },
  club: { nationality: 'SA', applicantRole: 'owner', entityType: 'club', hasBranches: 'no', hasExtraCoaches: 'no', safetyEquipment: 'no' },
}

/**
 * Documents collected on the final step (§10).
 *
 * `required` may be a predicate so conditional documents (guardian consent, a
 * delegation letter) only become mandatory when they actually apply.
 * `oneOf` marks a group where any one member satisfies the requirement — an
 * athlete supplies an ID *or*, if they hold none, a birth certificate. The
 * group carries its own label and required marker so an empty group cannot
 * block submission silently (REG-10).
 */
export const ATTACHMENT_GROUPS = {
  identity: {
    label: { ar: 'إثبات الهوية', en: 'Proof of identity' },
    hint: {
      ar: 'أرفق واحداً من التالي على الأقل.',
      en: 'Attach at least one of the following.',
    },
  },
}

export const ATTACHMENTS = {
  athlete: [
    { key: 'personalPhoto', label: { ar: 'صورة شخصية', en: 'Personal photo' }, hint: { ar: 'واضحة وحديثة', en: 'Clear and recent' }, required: true },
    {
      key: 'idDocument',
      // REG-10: the label now lists every type the document-type selector offers.
      label: {
        ar: 'الهوية الوطنية / الإقامة / جواز السفر / هوية دول مجلس التعاون',
        en: 'National ID / Iqama / Passport / GCC ID',
      },
      oneOf: 'identity',
    },
    {
      key: 'birthCertificate',
      label: { ar: 'شهادة الميلاد', en: 'Birth certificate' },
      hint: { ar: 'لمن لا يملك هوية', en: 'For applicants who hold no ID' },
      oneOf: 'identity',
    },
    {
      key: 'guardianConsent',
      label: { ar: 'موافقة ولي الأمر', en: 'Guardian consent' },
      hint: { ar: 'مطلوبة للاعبين أقل من 18 سنة', en: 'Required for athletes under 18' },
      when: isMinor,
      required: isMinor,
    },
  ],
  coach: [
    { key: 'personalPhoto', label: { ar: 'صورة شخصية', en: 'Personal photo' }, required: true },
    {
      key: 'idDocument',
      label: {
        ar: 'الهوية الوطنية / الإقامة / جواز السفر / هوية دول مجلس التعاون',
        en: 'National ID / Iqama / Passport / GCC ID',
      },
      required: true,
    },
    {
      key: 'coachingCertificates',
      label: { ar: 'شهادات التدريب', en: 'Coaching certificates' },
      hint: { ar: 'الصادرة من الاتحاد أو غيرها، إن وجدت', en: 'Federation-issued or other, if any' },
    },
  ],
  official: [
    { key: 'personalPhoto', label: { ar: 'صورة شخصية', en: 'Personal photo' }, required: true },
    {
      key: 'idDocument',
      label: {
        ar: 'الهوية الوطنية / الإقامة / جواز السفر / هوية دول مجلس التعاون',
        en: 'National ID / Iqama / Passport / GCC ID',
      },
      required: true,
    },
    {
      key: 'refereeCertificates',
      label: { ar: 'شهادات الدورات التحكيمية', en: 'Refereeing course certificates' },
      hint: { ar: 'إن وجدت', en: 'If any' },
    },
  ],
  club: [
    { key: 'municipalLicence', label: { ar: 'الترخيص البلدي', en: 'Municipal licence' }, required: true },
    { key: 'commercialRegistration', label: { ar: 'السجل التجاري', en: 'Commercial registration' }, hint: { ar: 'إن وجد', en: 'If any' } },
    { key: 'authorityLicence', label: { ar: 'ترخيص الجهة المختصة', en: 'Competent authority licence' }, hint: { ar: 'إن وجد', en: 'If any' } },
    { key: 'clubLogo', label: { ar: 'شعار النادي', en: 'Club logo' }, hint: { ar: 'إن وجد', en: 'If any' } },
    { key: 'facilityPhotos', label: { ar: 'صور المنشأة أو صالة التدريب', en: 'Facility or training hall photos' }, hint: { ar: 'إن وجدت', en: 'If any' } },
    {
      key: 'delegationLetter',
      label: { ar: 'خطاب تفويض', en: 'Delegation letter' },
      hint: { ar: 'مطلوب عندما لا يكون مقدم الطلب هو المالك', en: 'Required when the applicant is not the owner' },
      when: (v) => v.applicantRole && v.applicantRole !== 'owner',
      required: (v) => v.applicantRole && v.applicantRole !== 'owner',
    },
  ],
}

export const ACCEPTED_FILE_TYPES = '.jpg,.jpeg,.png,.webp,.pdf'

/**
 * REG-09 — documents are capped at 1 MB. Images above the cap are compressed
 * in the browser before upload (see compressImage in pages/Registration.jsx);
 * a PDF that is still oversized after that is rejected with the limit stated.
 */
export const MAX_FILE_BYTES = 1024 * 1024
export const MAX_FILE_LABEL = { ar: '1 ميجابايت', en: '1 MB' }

/** Rows shown in the final review panel, per category. */
const NAME_ROW = {
  label: { ar: 'الاسم', en: 'Name' },
  from: ['firstNameAr', 'fatherNameAr', 'familyNameAr'],
  join: ' ',
}
const NAME_ROW_EN = {
  label: { ar: 'الاسم بالإنجليزية', en: 'Name (English)' },
  from: ['firstNameEn', 'fatherNameEn', 'familyNameEn'],
  join: ' ',
}

export const REVIEW_ROWS = {
  athlete: [
    NAME_ROW,
    NAME_ROW_EN,
    { label: { ar: 'الهوية', en: 'Identity' }, from: ['documentType', 'nationalId'] },
    { label: { ar: 'الجنسية', en: 'Nationality' }, from: ['nationality'] },
    { label: { ar: 'التواصل', en: 'Contact' }, from: ['phone', 'email'] },
    { label: { ar: 'الموقع', en: 'Location' }, from: ['region', 'city'] },
    { label: { ar: 'النادي والمدرب', en: 'Club & coach' }, from: ['clubName', 'coachName'] },
    { label: { ar: 'الفئة التنافسية', en: 'Competition category' }, from: ['athleteCategory'] },
    { label: { ar: 'الوزن الحالي', en: 'Current weight' }, from: ['currentWeight'], suffix: { ar: 'كجم', en: 'kg' } },
  ],
  coach: [
    NAME_ROW,
    NAME_ROW_EN,
    { label: { ar: 'الهوية', en: 'Identity' }, from: ['documentType', 'nationalId'] },
    { label: { ar: 'الجنسية', en: 'Nationality' }, from: ['nationality'] },
    { label: { ar: 'التواصل', en: 'Contact' }, from: ['phone', 'email'] },
    { label: { ar: 'الموقع', en: 'Location' }, from: ['region', 'city'] },
    { label: { ar: 'جهة العمل', en: 'Workplace' }, from: ['clubName', 'affiliationStatus'] },
    { label: { ar: 'سنوات الخبرة', en: 'Years of experience' }, from: ['yearsExperience'] },
  ],
  official: [
    NAME_ROW,
    NAME_ROW_EN,
    { label: { ar: 'الهوية', en: 'Identity' }, from: ['documentType', 'nationalId'] },
    { label: { ar: 'الجنسية', en: 'Nationality' }, from: ['nationality'] },
    { label: { ar: 'التواصل', en: 'Contact' }, from: ['phone', 'email'] },
    { label: { ar: 'الموقع', en: 'Location' }, from: ['region', 'city'] },
    { label: { ar: 'التصنيف', en: 'Grade' }, from: ['refereeGrade'] },
    { label: { ar: 'البطولات', en: 'Tournaments' }, from: ['tournamentsCount'] },
  ],
  club: [
    { label: { ar: 'الجهة', en: 'Entity' }, from: ['nameAr', 'entityType'] },
    { label: { ar: 'مقدم الطلب', en: 'Applicant' }, from: ['firstNameAr', 'fatherNameAr', 'familyNameAr'], join: ' ' },
    { label: { ar: 'صفة مقدم الطلب', en: 'Applicant capacity' }, from: ['applicantRole'] },
    { label: { ar: 'التواصل', en: 'Contact' }, from: ['applicantPhone', 'officialEmail'] },
    { label: { ar: 'الموقع', en: 'Location' }, from: ['region', 'city', 'district'] },
    { label: { ar: 'المالك', en: 'Owner' }, from: ['ownerName'] },
    { label: { ar: 'المدرب الأساسي', en: 'Head coach' }, from: ['headCoachName', 'headCoachPhone'] },
  ],
}

export { COUNTRIES }
