import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { registrationsApi } from '../api/resources'
import { useAuth } from '../context/AuthContext'
import { extractErrorMessage, formatDate, formatDateTime, pick } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import MembershipCardPanel from '../components/MembershipCardPanel'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import ConfirmDialog from '../components/ConfirmDialog'
import { TrashIcon } from '../components/Icons'

/**
 * One membership request, reviewed top to bottom.
 *
 * The queue (RegistrationsList) used to expand a table row into this whole
 * workflow, which put an applicant's identity, documents, decision controls,
 * edit form and audit trail inside a cell. A reviewer now opens the request and
 * reads it in order: who applied, where the request stands, what they sent,
 * what may be decided, what the applicant was actually told, and who has
 * touched it.
 *
 * The rules are the federation's Phase 2 document: four tracks with a five-stage
 * chain each (§2–§5), a permission matrix in which reviewing and approving are
 * deliberately separate grants (§6), and a three-year term with renewal, expiry
 * and suspension (§1, §6). Two of them shape this screen:
 *
 *   • The decision controls offer only the transitions the API will accept from
 *     the current status, narrowed to the ones this user is permitted to make.
 *   • Nothing here is a security boundary. The API re-checks every permission
 *     and every transition, so this only decides what is worth showing.
 */

/** Used until /statuses answers, so the screen still works if that call fails. */
const FALLBACK_STATUSES = [
  { value: 'new', labelEn: 'New', requiresReason: false, requiredAction: 'review', allowedNext: ['under_review', 'awaiting_completion', 'rejected', 'cancelled'] },
  { value: 'under_review', labelEn: 'Under Review', requiresReason: false, requiredAction: 'review', allowedNext: ['awaiting_completion', 'awaiting_approval', 'rejected', 'cancelled'] },
  { value: 'awaiting_completion', labelEn: 'Awaiting Completion', requiresReason: true, requiredAction: 'request_completion', allowedNext: ['under_review', 'rejected', 'cancelled'] },
  { value: 'awaiting_approval', labelEn: 'Awaiting Approval', requiresReason: false, requiredAction: 'review', allowedNext: ['approved', 'rejected', 'awaiting_completion', 'cancelled'] },
  { value: 'approved', labelEn: 'Approved', requiresReason: false, requiredAction: 'approve', allowedNext: ['suspended', 'expired', 'cancelled', 'completed'] },
  { value: 'rejected', labelEn: 'Rejected', requiresReason: true, requiredAction: 'reject', allowedNext: [] },
  { value: 'cancelled', labelEn: 'Cancelled', requiresReason: false, requiredAction: 'suspend', allowedNext: [] },
  { value: 'completed', labelEn: 'Completed', requiresReason: false, requiredAction: 'review', allowedNext: [] },
  { value: 'suspended', labelEn: 'Suspended', requiresReason: true, requiredAction: 'suspend', allowedNext: ['approved', 'cancelled'] },
  { value: 'expired', labelEn: 'Expired', requiresReason: false, requiredAction: 'review', allowedNext: ['approved', 'cancelled'] },
]

const STATUS_TONE = {
  new: 'gold',
  under_review: 'gold',
  awaiting_completion: 'gold',
  awaiting_approval: 'gold',
  approved: 'green',
  rejected: 'red',
  cancelled: 'neutral',
  completed: 'green',
  suspended: 'red',
  expired: 'neutral',
}

const TYPE_LABEL = { athlete: 'Athlete', club: 'Club', coach: 'Coach', official: 'Referee / Official' }

/** Delivery outcome of one message, as the reviewer needs to read it. */
const NOTIFICATION_TONE = { sent: 'green', outbox: 'gold', failed: 'red', skipped: 'neutral' }
const NOTIFICATION_LABEL = {
  sent: 'Sent',
  outbox: 'Held in outbox: no mail server configured',
  failed: 'Failed',
  skipped: 'Skipped: no recipient',
}

/** Handled on their own rather than in the applicant field groups. */
const PAYLOAD_EXCLUDED = new Set(['attachments'])

/**
 * The payload keys the portal can submit, grouped the way a reviewer reads
 * them. Keys the portal adds later — or that only some categories send — still
 * appear: whatever is left over is rendered under "Other details", so nothing
 * an applicant submitted can be hidden by this list falling behind.
 */
const FIELD_GROUPS = [
  {
    title: 'Identity',
    keys: [
      'firstNameAr', 'fatherNameAr', 'familyNameAr',
      'firstNameEn', 'fatherNameEn', 'familyNameEn',
      'documentType', 'nationalId', 'dateOfBirth', 'gender', 'nationality',
      'applicantRole', 'applicantId',
    ],
  },
  {
    title: 'Contact & location',
    keys: [
      'phone', 'mobile', 'email',
      'applicantPhone', 'applicantEmail', 'officialEmail', 'officialPhone',
      'region', 'city', 'district', 'nationalAddress', 'shortAddress', 'socialMedia',
    ],
  },
  {
    // §10 — an athlete under 18 must supply a guardian.
    title: 'Guardian',
    keys: ['guardianName', 'guardianPhone', 'guardianRelation'],
  },
  {
    title: 'Athlete details',
    types: ['athlete'],
    keys: [
      'athleteCategory', 'competitionTrack', 'eligibleCategories',
      'weightDivision', 'currentWeight', 'height',
      'paraAthlete', 'paraClassification',
      'clubName', 'coachName', 'previousClubs', 'cvUrl',
    ],
  },
  {
    title: 'Coaching details',
    types: ['coach'],
    keys: [
      'coachingLevel', 'yearsExperience', 'affiliationStatus', 'clubName',
      'categoriesCoached', 'coursesAttended', 'attendedFederationCourses',
      'externalCertificates', 'cvUrl',
    ],
  },
  {
    title: 'Refereeing record',
    types: ['official'],
    keys: [
      'refereeGrade', 'refereeStartDate', 'yearsExperience',
      'tournamentsCount', 'lastTournament', 'lastRefereeingDate',
      'clubName', 'cvUrl',
    ],
  },
  {
    title: 'Entity',
    types: ['club'],
    keys: [
      'nameAr', 'nameEn', 'entityType', 'sector',
      'clubWebsite', 'clubSocialMedia', 'googleMapsUrl',
    ],
  },
  {
    title: 'Owner & head coach',
    types: ['club'],
    keys: [
      'ownerName', 'ownerId', 'ownerEmail', 'ownerPhone',
      'headCoachName', 'headCoachPhone', 'headCoachEmail', 'headCoachCertificates',
    ],
  },
  {
    title: 'Facility',
    types: ['club'],
    keys: [
      'hasBranches', 'branchCount', 'branchDetails',
      'hasExtraCoaches', 'extraCoachDetails',
      'approxAthletes', 'categoriesAccepted', 'trainingSchedule', 'safetyEquipment',
    ],
  },
  {
    title: 'Submission',
    keys: ['registrationType', 'submittedAt', 'submittedLanguage', 'consent', 'notes'],
  },
]

const FIELD_LABELS = {
  affiliationStatus: 'Affiliation status',
  applicantEmail: 'Applicant email',
  applicantId: 'Applicant ID number',
  applicantPhone: 'Applicant mobile',
  applicantRole: 'Applicant capacity',
  approxAthletes: 'Approximate number of athletes',
  athleteCategory: 'Competition category',
  eligibleCategories: 'Categories this age may enter',
  competitionTrack: 'Competition track',
  attendedFederationCourses: 'Attended federation courses',
  branchCount: 'Number of branches',
  branchDetails: 'Branch details',
  categoriesAccepted: 'Categories accepted',
  categoriesCoached: 'Categories coached',
  city: 'City',
  clubName: 'Club or centre',
  clubSocialMedia: 'Club social media',
  clubWebsite: 'Club website',
  coachName: 'Coach name',
  coachingLevel: 'Coaching level',
  consent: 'Consent given',
  coursesAttended: 'Courses attended',
  currentWeight: 'Current weight (kg)',
  cvUrl: 'CV link',
  dateOfBirth: 'Date of birth',
  district: 'District',
  documentType: 'Document type',
  email: 'Email address',
  entityType: 'Entity type',
  externalCertificates: 'External certificates',
  extraCoachDetails: 'Additional coaches',
  familyNameAr: 'Family name (Arabic)',
  familyNameEn: 'Family name (English)',
  fatherNameAr: "Father's name (Arabic)",
  fatherNameEn: "Father's name (English)",
  firstNameAr: 'First name (Arabic)',
  firstNameEn: 'First name (English)',
  gender: 'Gender',
  googleMapsUrl: 'Google Maps location',
  guardianName: 'Guardian name',
  guardianPhone: 'Guardian mobile',
  guardianRelation: 'Relationship to the athlete',
  hasBranches: 'Has branches',
  hasExtraCoaches: 'Has additional coaches',
  headCoachCertificates: 'Head coach certificates',
  headCoachEmail: 'Head coach email',
  headCoachName: 'Head coach',
  headCoachPhone: 'Head coach mobile',
  height: 'Height (cm)',
  lastRefereeingDate: 'Last refereeing date',
  lastTournament: 'Last tournament',
  mobile: 'Mobile number',
  nameAr: 'Entity name (Arabic)',
  nameEn: 'Entity name (English)',
  nationalAddress: 'National address',
  nationalId: 'ID / Iqama / passport number',
  nationality: 'Nationality',
  notes: 'Applicant notes',
  officialEmail: 'Official email',
  officialPhone: 'Official phone',
  ownerEmail: 'Owner email',
  ownerId: 'Owner ID number',
  ownerName: 'Owner',
  ownerPhone: 'Owner mobile',
  paraAthlete: 'Para athlete',
  paraClassification: 'Para classification',
  phone: 'Mobile number',
  previousClubs: 'Previous clubs',
  refereeGrade: 'Referee grade',
  refereeStartDate: 'Refereeing since',
  region: 'Region',
  registrationType: 'Registration category',
  safetyEquipment: 'Safety equipment',
  sector: 'Sector',
  shortAddress: 'Short address',
  socialMedia: 'Social media',
  submittedAt: 'Submitted at',
  submittedLanguage: 'Submitted in',
  tournamentsCount: 'Tournaments officiated',
  trainingSchedule: 'Training schedule',
  weightDivision: 'Weight division',
  yearsExperience: 'Years of experience',
}

/* Which document slots each track actually uses, mirroring ATTACHMENTS in
   web/src/data/registrationPortal.js. The console offers a club's licences on a
   club application and an athlete's consent on an athlete's, rather than all
   twelve slots on every request. Anything already on a record is listed
   regardless, so an unexpected slot is never hidden from the reviewer. */
const SLOTS_BY_TYPE = {
  athlete: ['personalPhoto', 'idDocument', 'birthCertificate', 'guardianConsent'],
  coach: ['personalPhoto', 'idDocument', 'coachingCertificates'],
  official: ['personalPhoto', 'idDocument', 'refereeCertificates'],
  club: [
    'municipalLicence', 'commercialRegistration', 'authorityLicence',
    'clubLogo', 'facilityPhotos', 'delegationLetter',
  ],
}

/** Document slots, labelled as the portal labelled them for the applicant. */
const ATTACHMENT_LABELS = {
  authorityLicence: 'Competent authority licence',
  birthCertificate: 'Birth certificate',
  clubLogo: 'Club logo',
  coachingCertificates: 'Coaching certificates',
  commercialRegistration: 'Commercial registration',
  delegationLetter: 'Delegation letter',
  facilityPhotos: 'Facility photos',
  guardianConsent: 'Guardian consent',
  idDocument: 'ID / Iqama / passport',
  municipalLicence: 'Municipal licence',
  personalPhoto: 'Personal photo',
  refereeCertificates: 'Refereeing certificates',
}

const ARABIC_PATTERN = /[؀-ۿݐ-ݿࢠ-ࣿ]/
const DATE_KEYS = /(^dateOfBirth$)|(Date$)|(At$)/

/* The competition categories the API calculates (tracker items 00/BUG-15).
   Stored as the short value; shown here as the name a reviewer recognises. */
const CATEGORY_LABELS = {
  u8: 'U8', u10: 'U10', u12: 'U12', u14: 'U14', u16: 'U16', u18: 'U18',
  u24: 'U24', elite: 'Elite',
  masters_35: 'Masters 35+', masters_40: 'Masters 40+', masters_45: 'Masters 45+',
  // Phase 2 wrote a single "masters" before the signed Phase 3 document split
  // it into three; records from then still read sensibly.
  masters: 'Masters',
}

/** Phase 3 REQ-02 rule 3 — an athlete competes in one of these only. */
const TRACK_LABELS = {
  development: 'Development (U8–U24)',
  elite: 'Elite',
  masters: 'Masters',
}
const CATEGORY_KEYS = new Set(['athleteCategory', 'eligibleCategories'])

/* BUG-10 — the editor rendered every answer as a text box, so a reviewer could
   put a negative number back into a field the portal refuses one in. These are
   the numeric answers, with the bounds the API enforces. */
const NUMERIC_FIELDS = {
  currentWeight: { min: 0, max: 250, step: '0.1' },
  height: { min: 0, max: 260, step: '1' },
  yearsExperience: { min: 0, max: 70, step: '1' },
  tournamentsCount: { min: 0, max: 2000, step: '1' },
  approxAthletes: { min: 0, max: 100000, step: '1' },
  branchCount: { min: 1, max: 500, step: '1' },
}

/** Falls back to a readable version of the key itself for anything unlisted. */
function labelForKey(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const spaced = key.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function parsePayload(detail) {
  const raw = pick(detail, ['payloadJson', 'payload'], '{}')
  if (raw && typeof raw === 'object') return raw
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

function attachmentsOf(payload) {
  const attachments = payload?.attachments
  if (!attachments || typeof attachments !== 'object') return []
  return Object.entries(attachments)
    .filter(([, value]) => value && typeof value === 'object' && value.id)
    .map(([slot, value]) => ({ slot, ...value }))
}

/** Wording for the reason box, which differs by what the reason is for. */
function reasonLabel(status) {
  if (status === 'rejected') return 'Reason for rejection — sent to the applicant'
  if (status === 'suspended') return 'Reason for suspension — sent to the applicant'
  if (status === 'cancelled') return 'Reason for cancellation — sent to the applicant'
  return 'What is missing — listed to the applicant in the email and SMS'
}

function displayValue(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (key === 'competitionTrack') return TRACK_LABELS[value] || value
  if (CATEGORY_KEYS.has(key)) {
    const names = (Array.isArray(value) ? value : [value]).map((entry) => CATEGORY_LABELS[entry] || entry)
    return names.length ? names.join(', ') : '—'
  }
  if (Array.isArray(value)) {
    if (!value.length) return '—'
    return value.every((entry) => entry === null || typeof entry !== 'object')
      ? value.join(', ')
      : JSON.stringify(value)
  }
  if (typeof value === 'object') return JSON.stringify(value)
  if (DATE_KEYS.test(key)) {
    const formatted = key.endsWith('At') ? formatDateTime(value) : formatDate(value)
    if (formatted) return formatted
  }
  return String(value)
}

/** One labelled payload value. Arabic answers are rendered right to left. */
function PayloadField({ name, value }) {
  const text = displayValue(name, value)
  const rtl = ARABIC_PATTERN.test(text)
  return (
    <div className="detail-grid__item">
      <dt>{labelForKey(name)}</dt>
      <dd {...(rtl ? { dir: 'rtl', lang: 'ar' } : {})}>{text}</dd>
    </div>
  )
}

export default function RegistrationReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()

  const [detail, setDetail] = useState(null)
  const [statuses, setStatuses] = useState(FALLBACK_STATUSES)
  const [tracks, setTracks] = useState([])
  const [audit, setAudit] = useState([])
  const [notifications, setNotifications] = useState([])

  const [loading, setLoading] = useState(true)
  /** Set when the record itself cannot be shown at all: 404 or 403. */
  const [blocked, setBlocked] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [pendingChange, setPendingChange] = useState(null)
  const [reopenReason, setReopenReason] = useState('')
  // §6 تعديل — the open editor, as { fields, internalNotes, membershipNumber }.
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  /** The trail and the message log are re-read after anything that adds to them. */
  const loadHistory = useCallback(async () => {
    const [trail, messages] = await Promise.all([
      registrationsApi.audit(id).catch(() => []),
      registrationsApi.notifications(id).catch(() => []),
    ])
    setAudit(Array.isArray(trail) ? trail : [])
    setNotifications(Array.isArray(messages) ? messages : [])
  }, [id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setBlocked(null)
    setError('')

    registrationsApi
      .get(id)
      .then(async (record) => {
        if (cancelled) return
        setDetail(record)
        await loadHistory()
      })
      .catch((err) => {
        if (cancelled) return
        const status = err?.response?.status
        if (status === 404) setBlocked('not-found')
        else if (status === 403) setBlocked('forbidden')
        else setError(extractErrorMessage(err, 'Could not open this registration.'))
      })
      .finally(() => !cancelled && setLoading(false))

    registrationsApi
      .statuses()
      .then((data) => {
        if (!cancelled && Array.isArray(data) && data.length) setStatuses(data)
      })
      .catch(() => {
        /* Keep the fallback vocabulary. */
      })

    registrationsApi
      .tracks()
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setTracks(data)
      })
      .catch(() => {
        /* The stage strip is an enhancement; the page works without it. */
      })

    return () => {
      cancelled = true
    }
  }, [id, loadHistory])

  const statusMap = useMemo(() => {
    const map = {}
    statuses.forEach((entry) => {
      map[entry.value] = entry
    })
    return map
  }, [statuses])

  const labelOf = useCallback((status) => statusMap[status]?.labelEn || status, [statusMap])

  const summary = useMemo(() => detail?.summary || detail || {}, [detail])
  const status = pick(detail, ['status'], 'new')
  const type = pick(detail, ['type'], 'athlete')
  const reference = detail?.referenceNumber || `#${id}`

  const track = useMemo(
    () => tracks.find((entry) => entry.key === type) || detail?.track || null,
    [tracks, detail, type],
  )

  const payload = useMemo(() => parsePayload(detail), [detail])
  const attachments = useMemo(() => attachmentsOf(payload), [payload])

  /** The slots this track uses, plus any already filled on this record. */
  const uploadSlots = useMemo(() => {
    const slots = [...(SLOTS_BY_TYPE[type] || Object.keys(ATTACHMENT_LABELS))]
    attachments.forEach((entry) => {
      if (!slots.includes(entry.slot)) slots.push(entry.slot)
    })
    return slots
  }, [type, attachments])

  /**
   * The moves offered: what the API allows from the current status (§6
   * transition rules), narrowed to what this user may perform.
   */
  const moves = useMemo(() => {
    const allowed = statusMap[status]?.allowedNext || []
    return allowed
      .map((value) => statusMap[value])
      .filter(Boolean)
      .filter((entry) => can(entry.requiredAction || 'review'))
  }, [statusMap, status, can])

  /**
   * §6 — rejection and cancellation are terminal in the lifecycle, so returning
   * a request to review is a separate, deliberate act with its own authority.
   */
  const canReopen = (status === 'rejected' || status === 'cancelled') && can('approve')
  const canRenew = can('approve') && (status === 'approved' || status === 'expired')

  /**
   * The categories this athlete may hold (BUG-15). The API stores the list it
   * calculated alongside the assignment, so the editor offers exactly what the
   * server would accept rather than working it out a second time and risking a
   * different answer.
   */
  const eligibleCategories = useMemo(() => {
    const stored = payload.eligibleCategories
    if (Array.isArray(stored) && stored.length) return stored
    return payload.athleteCategory ? [payload.athleteCategory] : []
  }, [payload])

  /** Payload fields, grouped; anything unlisted still shows under "Other details". */
  const fieldGroups = useMemo(() => {
    const claimed = new Set(PAYLOAD_EXCLUDED)
    const groups = []

    FIELD_GROUPS.filter((group) => !group.types || group.types.includes(type)).forEach((group) => {
      const keys = group.keys.filter((key) => !claimed.has(key) && payload[key] !== undefined)
      keys.forEach((key) => claimed.add(key))
      if (keys.length) groups.push({ title: group.title, keys })
    })

    const leftover = Object.keys(payload).filter((key) => !claimed.has(key))
    if (leftover.length) groups.push({ title: 'Other details', keys: leftover })
    return groups
  }, [payload, type])

  function accept(updated) {
    if (updated && typeof updated === 'object') setDetail(updated)
  }

  /** Statuses needing a reason (or a membership number) collect it before sending. */
  function selectStatus(next) {
    if (!next || next === status) return
    setError('')
    setNotice('')
    if (statusMap[next]?.requiresReason || next === 'approved') {
      setPendingChange({ status: next, reason: '', membershipNumber: detail?.membershipNumber || '' })
      return
    }
    applyStatus({ status: next })
  }

  async function applyStatus(patch) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      accept(await registrationsApi.updateStatus(id, patch))
      setPendingChange(null)
      setNotice(`${reference} moved to “${labelOf(patch.status)}”. The applicant has been notified.`)
      await loadHistory()
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update this registration.'))
    } finally {
      setBusy(false)
    }
  }

  async function renew() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const updated = await registrationsApi.renew(id)
      accept(updated)
      const expiry = (updated?.summary || updated)?.expiresAt
      setNotice(`${reference} renewed${expiry ? ` until ${formatDate(expiry)}` : ''}.`)
      await loadHistory()
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not renew this membership.'))
    } finally {
      setBusy(false)
    }
  }

  async function reopen() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      accept(await registrationsApi.reopen(id, reopenReason.trim()))
      setReopenReason('')
      setNotice(`${reference} is back under review. The reopening and its reason are in the audit trail.`)
      await loadHistory()
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not reopen this request.'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Opens the editor over the record's own payload. Only scalar fields are
   * offered: attachments and nested objects are managed through their own
   * flows, and a text box is the wrong tool for them.
   */
  function startEditing() {
    const fields = Object.fromEntries(
      Object.entries(payload)
        .filter(([key, value]) => !PAYLOAD_EXCLUDED.has(key) && (value === null || typeof value !== 'object'))
        .map(([key, value]) => [key, value ?? '']),
    )
    setEditing({
      fields,
      internalNotes: detail?.internalNotes || '',
      membershipNumber: detail?.membershipNumber || '',
    })
  }

  async function saveEdit() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      // The untouched parts of the payload are preserved: only the scalar
      // fields the editor showed are replaced.
      accept(
        await registrationsApi.update(id, {
          payload: { ...payload, ...editing.fields },
          internalNotes: editing.internalNotes,
          membershipNumber: editing.membershipNumber || null,
        }),
      )
      setEditing(null)
      setNotice(`${reference} updated. The applicant has been notified.`)
      await loadHistory()
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save these changes.'))
    } finally {
      setBusy(false)
    }
  }

  /* BUG-11 — the documents on a request are now the reviewer's to manage.
     `slot` is the portal's own field name, so anything uploaded here lands
     where the applicant's own file would have. */
  const [uploadSlot, setUploadSlot] = useState('')
  const [uploading, setUploading] = useState(false)
  const [removingDoc, setRemovingDoc] = useState('')

  async function uploadDocument(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !uploadSlot) return

    setError('')
    setUploading(true)
    try {
      accept(await registrationsApi.uploadAttachment(id, uploadSlot, file))
      setNotice(`${ATTACHMENT_LABELS[uploadSlot] || labelForKey(uploadSlot)} saved to this request.`)
      setUploadSlot('')
      await loadHistory()
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not upload that document.'))
    } finally {
      setUploading(false)
    }
  }

  async function removeDocument(attachment) {
    setError('')
    setRemovingDoc(attachment.id)
    try {
      accept(await registrationsApi.deleteAttachment(id, attachment.id))
      setNotice(`${ATTACHMENT_LABELS[attachment.slot] || labelForKey(attachment.slot)} removed from this request.`)
      await loadHistory()
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not remove that document.'))
    } finally {
      setRemovingDoc('')
    }
  }

  async function download(attachment) {
    setError('')
    try {
      await registrationsApi.openAttachment(id, attachment.id, attachment.fileName)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not download that document.'))
    }
  }

  async function handleDeleteConfirmed() {
    setDeleting(true)
    try {
      await registrationsApi.remove(id)
      navigate('/registrations')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not delete this registration.'))
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const backLink = (
    <Link to="/registrations" className="btn btn--ghost">
      Back to queue
    </Link>
  )

  if (loading) return <Spinner label="Loading this registration…" />

  if (blocked || !detail) {
    return (
      <div>
        <PageHeader title="Membership request" actions={backLink} />
        <Alert type="error">
          {blocked === 'not-found'
            ? 'This registration no longer exists. It may have been deleted.'
            : blocked === 'forbidden'
              ? 'You do not have the عرض (view) permission for the membership register, so this request cannot be shown.'
              : error || 'This registration could not be loaded.'}
        </Alert>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={reference}
        description={`${summary.applicantName || 'Applicant name not given'} · ${TYPE_LABEL[type] || type}`}
        actions={backLink}
      />

      <div className="review-identity">
        <Badge tone={STATUS_TONE[status] || 'neutral'}>{labelOf(status)}</Badge>
        {detail.membershipNumber ? (
          <span className="review-identity__item">
            Membership no. <code>{detail.membershipNumber}</code>
          </span>
        ) : (
          <span className="review-identity__item review-identity__item--muted">No membership number yet</span>
        )}
        {summary.contactEmail && <span className="review-identity__item">{summary.contactEmail}</span>}
        {summary.contactPhone && (
          <span className="review-identity__item" dir="ltr">
            {summary.contactPhone}
          </span>
        )}
      </div>

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      {/* ── 1. At a glance ─────────────────────────────────────────────── */}
      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">At a glance</h3>

        {/* §2–§5 — the track's approval chain, with the current stage marked and
            the responsible party named, so a reviewer sees whose step it is. */}
        {track && (
          <>
            <p className="form-card__intro">
              {track.licenceNameEn} · {track.termYears}-year term · stage {summary.stageOrder || detail.stageOrder || 1}{' '}
              of {track.stages?.length || 0}
            </p>
            <ol className="stage-strip">
              {(track.stages || []).map((stage) => (
                <li
                  key={stage.order}
                  className={`stage-strip__item ${stage.order === (detail.stageOrder || 0) ? 'is-current' : ''} ${
                    stage.order < (detail.stageOrder || 0) ? 'is-done' : ''
                  }`}
                >
                  <span className="stage-strip__order">{stage.order}</span>
                  <span className="stage-strip__name">{stage.nameEn}</span>
                  <span className="stage-strip__owner">{stage.ownerEn}</span>
                </li>
              ))}
            </ol>
            {track.registrationFeeEn && (
              <p className="stage-strip__fees">
                <strong>Registration:</strong> {track.registrationFeeEn} <strong>Renewal:</strong> {track.renewalFeeEn}
              </p>
            )}
          </>
        )}

        {(summary.isOverdue || summary.isExpired || detail.suspendedAt) && (
          <ul className="review-flags">
            {summary.isOverdue && (
              <li className="review-flags__item">
                The completion window closed on {formatDate(detail.completionDueAt)} and the applicant has not
                responded.
              </li>
            )}
            {summary.isExpired && (
              <li className="review-flags__item">The three-year term lapsed on {formatDate(detail.expiresAt)}.</li>
            )}
            {detail.suspendedAt && (
              <li className="review-flags__item">Suspended on {formatDate(detail.suspendedAt)}.</li>
            )}
          </ul>
        )}

        <dl className="detail-grid">
          <div className="detail-grid__item">
            <dt>Submitted</dt>
            <dd>{formatDateTime(detail.createdAt) || '—'}</dd>
          </div>
          <div className="detail-grid__item">
            <dt>Status last changed</dt>
            <dd>
              {formatDateTime(detail.statusChangedAt) || '—'}
              {detail.lastActionBy ? ` · ${detail.lastActionBy}` : ''}
            </dd>
          </div>
          <div className="detail-grid__item">
            <dt>Approved</dt>
            <dd>{formatDate(detail.approvedAt) || '—'}</dd>
          </div>
          <div className="detail-grid__item">
            <dt>Term ends</dt>
            {/* BUG-12 — an expired membership says so, with no days left to
                count. The API already clamps the counter at zero; this stops
                the screen implying a term that has been closed is still live. */}
            <dd>
              {detail.expiresAt ? formatDate(detail.expiresAt) : '—'}
              {detail.expiresAt && summary.isExpired ? (
                <span className="review-term--expired"> · Expired · 0 days left</span>
              ) : detail.expiresAt && typeof summary.daysUntilExpiry === 'number' ? (
                ` · ${summary.daysUntilExpiry} days left`
              ) : (
                ''
              )}
            </dd>
          </div>
          <div className="detail-grid__item">
            <dt>Completion due</dt>
            <dd>{detail.completionDueAt ? formatDateTime(detail.completionDueAt) : '—'}</dd>
          </div>
          <div className="detail-grid__item">
            <dt>Renewals</dt>
            <dd>
              {detail.renewalCount > 0 ? `${detail.renewalCount} · last ${formatDate(detail.renewedAt)}` : 'None'}
            </dd>
          </div>
          {detail.statusReason && (
            <div className="detail-grid__item">
              <dt>Reason on record</dt>
              <dd>{detail.statusReason}</dd>
            </div>
          )}
          {detail.internalNotes && (
            <div className="detail-grid__item">
              <dt>Internal notes — never sent to the applicant</dt>
              <dd>{detail.internalNotes}</dd>
            </div>
          )}
          {detail.supersedesId && (
            <div className="detail-grid__item">
              <dt>Re-application</dt>
              <dd>
                Replaces <Link to={`/registrations/${detail.supersedesId}`}>request #{detail.supersedesId}</Link>, which
                was rejected.
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* ── 2. Applicant details ───────────────────────────────────────── */}
      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Applicant details</h3>
        {fieldGroups.length === 0 ? (
          <p className="form-card__intro">This request carries no applicant data.</p>
        ) : (
          fieldGroups.map((group) => (
            <div key={group.title} className="review-group">
              <h4 className="review-group__title">{group.title}</h4>
              <dl className="detail-grid">
                {group.keys.map((key) => (
                  <PayloadField key={key} name={key} value={payload[key]} />
                ))}
              </dl>
            </div>
          ))
        )}
      </section>

      {/* ── 3. Membership card (ISSUE-03) ──────────────────────────────── */}
      {detail.approvedAt && (
        <section className="form-card">
          <h3 className="form-section-title form-section-title--first">Membership card</h3>
          <MembershipCardPanel registrationId={id} />
        </section>
      )}

      {/* ── 4. Documents ───────────────────────────────────────────────── */}
      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Documents</h3>
        {attachments.length === 0 ? (
          <p className="form-card__intro">No documents were attached to this request.</p>
        ) : (
          <ul className="doc-list">
            {attachments.map((attachment) => (
              <li className="doc-list__item" key={attachment.id}>
                <div className="doc-list__text">
                  <span className="doc-list__slot">
                    {ATTACHMENT_LABELS[attachment.slot] || labelForKey(attachment.slot)}
                  </span>
                  <span className="doc-list__file">{attachment.fileName}</span>
                </div>
                <div className="doc-list__actions">
                  <button type="button" className="btn btn--small" onClick={() => download(attachment)}>
                    Open
                  </button>
                  {can('edit') && (
                    <button
                      type="button"
                      className="btn btn--small btn--danger-ghost"
                      disabled={removingDoc === attachment.id}
                      onClick={() => removeDocument(attachment)}
                    >
                      {removingDoc === attachment.id ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* BUG-11 — adding a document the applicant sent in later, or replacing
            one that was wrong. Choosing a slot that already holds a file
            replaces it, and the old file is deleted with it. */}
        {can('edit') && (
          <div className="doc-add">
            <label className="field">
              <span>Add or replace a document</span>
              <select value={uploadSlot} onChange={(event) => setUploadSlot(event.target.value)}>
                <option value="">Choose what this document is…</option>
                {uploadSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {ATTACHMENT_LABELS[slot] || labelForKey(slot)}
                    {attachments.some((entry) => entry.slot === slot) ? ' (replaces the current file)' : ''}
                  </option>
                ))}
              </select>
              <span className="field__hint">JPG, PNG, WEBP or PDF, up to 1 MB — the same limits the portal applies.</span>
            </label>
            <label className={`btn btn--secondary${!uploadSlot || uploading ? ' is-disabled' : ''}`}>
              {uploading ? 'Uploading…' : 'Choose file'}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                hidden
                disabled={!uploadSlot || uploading}
                onChange={uploadDocument}
              />
            </label>
          </div>
        )}
      </section>

      {/* ── 4. Decision ────────────────────────────────────────────────── */}
      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Decision</h3>

        {moves.length === 0 && !canRenew && !canReopen && (
          <p className="form-card__intro">
            No action is available to you on this request from “{labelOf(status)}”.
          </p>
        )}

        {(moves.length > 0 || canRenew) && (
          <div className="review-actions">
            {/* Only the transitions the API accepts from here, and only those
                this role may make. */}
            {moves.map((entry) => (
              <button
                key={entry.value}
                type="button"
                className={`btn btn--small${entry.value === pendingChange?.status ? ' btn--primary' : ''}`}
                disabled={busy}
                onClick={() => selectStatus(entry.value)}
              >
                {entry.labelEn || entry.value}
              </button>
            ))}

            {/* §1 — renewal restarts the three-year term. */}
            {canRenew && (
              <button type="button" className="btn btn--small" disabled={busy} onClick={renew}>
                Renew term
              </button>
            )}
          </div>
        )}

        {pendingChange && (
          <div className="detail-panel">
            <h4>Move to “{labelOf(pendingChange.status)}”</h4>
            {statusMap[pendingChange.status]?.requiresReason && (
              <label className="detail-panel__field">
                <span>{reasonLabel(pendingChange.status)}</span>
                <textarea
                  rows={3}
                  value={pendingChange.reason}
                  onChange={(event) => setPendingChange({ ...pendingChange, reason: event.target.value })}
                />
              </label>
            )}
            {pendingChange.status === 'approved' && (
              <label className="detail-panel__field">
                <span>Membership / accreditation number (optional)</span>
                <input
                  type="text"
                  value={pendingChange.membershipNumber}
                  onChange={(event) => setPendingChange({ ...pendingChange, membershipNumber: event.target.value })}
                />
              </label>
            )}
            {pendingChange.status === 'awaiting_completion' && (
              <p className="field__hint">
                The applicant gets {'≈'}7 working days to respond; the deadline then shows above and in the queue.
              </p>
            )}
            <div className="detail-panel__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={
                  busy || (statusMap[pendingChange.status]?.requiresReason && !pendingChange.reason.trim())
                }
                onClick={() =>
                  applyStatus({
                    status: pendingChange.status,
                    statusReason: statusMap[pendingChange.status]?.requiresReason
                      ? pendingChange.reason.trim()
                      : null,
                    membershipNumber:
                      pendingChange.status === 'approved'
                        ? pendingChange.membershipNumber.trim() || null
                        : undefined,
                  })
                }
              >
                {busy ? 'Saving…' : 'Confirm'}
              </button>
              <button type="button" className="btn" onClick={() => setPendingChange(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* §6 — إعادة فتح. Where this screen used to say "no action available",
            a rejected or cancelled request can be put back into review by
            someone holding قبول authority. */}
        {canReopen && (
          <div className="detail-panel">
            <h4>Reopen for review</h4>
            <p className="field__hint">
              This returns the request to “Under Review” so it can be decided again; the reopening and its reason are
              recorded in the audit trail.
            </p>
            <label className="detail-panel__field">
              <span>Why is this being reopened? — required</span>
              <textarea rows={3} value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} />
            </label>
            <div className="detail-panel__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !reopenReason.trim()}
                onClick={reopen}
              >
                {busy ? 'Reopening…' : 'Reopen for review'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── 5. §6 تعديل — amend the stored record. Permitted after approval too;
             the API re-validates every field with the public form's own rules,
             so a correction cannot introduce data the portal would have
             refused. ─────────────────────────────────────────────────────── */}
      {can('edit') && (
        <section className="form-card">
          <h3 className="form-section-title form-section-title--first">Edit details</h3>
          {!editing ? (
            <>
              <p className="form-card__intro">
                Correct the stored answers, the membership number, or the internal notes.
              </p>
              <button type="button" className="btn btn--small" onClick={startEditing}>
                Edit details
              </button>
            </>
          ) : (
            <>
              <div className="edit-grid">
                {Object.entries(editing.fields).map(([key, value]) => {
                  const setField = (next) =>
                    setEditing({ ...editing, fields: { ...editing.fields, [key]: next } })
                  const numeric = NUMERIC_FIELDS[key]

                  return (
                    <label key={key} className="edit-grid__field">
                      <span>{labelForKey(key)}</span>

                      {/* BUG-15 — the competition category is a choice between
                          the categories this athlete's age allows, and nothing
                          else. The API refuses anything outside the list too,
                          so this is the honest version of a rule that holds
                          either way. */}
                      {key === 'athleteCategory' ? (
                        <select value={value} onChange={(event) => setField(event.target.value)}>
                          {eligibleCategories.length === 0 && <option value={value}>{value || '—'}</option>}
                          {eligibleCategories.map((entry) => (
                            <option key={entry} value={entry}>
                              {CATEGORY_LABELS[entry] || entry}
                            </option>
                          ))}
                        </select>
                      ) : numeric ? (
                        <input
                          type="number"
                          value={value}
                          min={numeric.min}
                          max={numeric.max}
                          step={numeric.step}
                          onKeyDown={(event) => {
                            if (event.key === '-' || event.key === 'e' || event.key === 'E') event.preventDefault()
                          }}
                          onChange={(event) => setField(event.target.value)}
                        />
                      ) : (
                        <input
                          type="text"
                          value={value}
                          dir={ARABIC_PATTERN.test(String(value)) ? 'rtl' : undefined}
                          onChange={(event) => setField(event.target.value)}
                        />
                      )}

                      {key === 'athleteCategory' && (
                        <span className="edit-grid__hint">
                          Calculated from the date of birth. Only the categories this age may enter are offered.
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>

              <label className="detail-panel__field">
                <span>Membership / accreditation number</span>
                <input
                  type="text"
                  value={editing.membershipNumber}
                  onChange={(event) => setEditing({ ...editing, membershipNumber: event.target.value })}
                />
              </label>

              <label className="detail-panel__field">
                <span>Internal notes — not sent to the applicant</span>
                <textarea
                  rows={3}
                  value={editing.internalNotes}
                  onChange={(event) => setEditing({ ...editing, internalNotes: event.target.value })}
                />
              </label>

              <p className="field__hint">
                Changing anything other than the internal notes notifies the applicant that their record was updated.
              </p>

              <div className="detail-panel__actions">
                <button type="button" className="btn btn--primary" disabled={busy} onClick={saveEdit}>
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── 6. Notifications — whether the applicant was actually told. ─── */}
      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Messages to the applicant</h3>
        {notifications.length === 0 ? (
          <p className="form-card__intro">Nothing has been sent about this request yet.</p>
        ) : (
          <ul className="notify-list">
            {notifications.map((entry) => {
              const state = String(entry.status || '').toLowerCase()
              return (
                <li key={entry.id} className="notify-list__item">
                  <span className="notify-list__channel">{entry.channel === 'sms' ? 'SMS' : 'Email'}</span>
                  <span className="notify-list__body">
                    <span className="notify-list__subject">{entry.subject || labelForKey(entry.templateKey || '')}</span>
                    <span className="notify-list__meta">
                      <span dir="ltr">{entry.recipient || 'no recipient'}</span>
                      {' · '}
                      <code>{entry.templateKey}</code>
                      {' · '}
                      {formatDateTime(entry.createdAt)}
                    </span>
                    {entry.detail && <span className="notify-list__detail">{entry.detail}</span>}
                  </span>
                  <span className="notify-list__status">
                    <Badge tone={NOTIFICATION_TONE[state] || 'neutral'}>
                      {NOTIFICATION_LABEL[state] || entry.statusLabelEn || entry.status}
                    </Badge>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── 7. Audit trail — compliance case P6: who did what, and when. ── */}
      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Audit trail</h3>
        {audit.length === 0 ? (
          <p className="form-card__intro">No administrative action has been recorded on this request yet.</p>
        ) : (
          <ul className="audit-list">
            {audit.map((entry) => (
              <li key={entry.id} className="audit-list__item">
                <span className="audit-list__when">{formatDateTime(entry.createdAt)}</span>
                <span className="audit-list__who">
                  {entry.actorName}
                  {entry.actorRole ? ` (${entry.actorRole})` : ''}
                </span>
                <span className="audit-list__what">
                  {entry.action?.split('.').pop()}
                  {entry.fromStatus && entry.toStatus
                    ? ` · ${labelOf(entry.fromStatus)} → ${labelOf(entry.toStatus)}`
                    : ''}
                </span>
                {entry.details && <span className="audit-list__note">{entry.details}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 8. Delete ──────────────────────────────────────────────────── */}
      {can('suspend') && (
        <section className="form-card">
          <h3 className="form-section-title form-section-title--first">Delete this request</h3>
          <p className="form-card__intro">
            Deleting removes the application and the evidence behind any decision made on it. Cancelling or suspending
            the membership is almost always the right action instead.
          </p>
          <button type="button" className="btn btn--danger btn--small" onClick={() => setConfirmDelete(true)}>
            <TrashIcon />
            Delete registration
          </button>
        </section>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this registration?"
        description="This permanently removes the application and the evidence behind any decision made on it. Suspending or cancelling the membership is usually the right action instead."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
      />
    </div>
  )
}
