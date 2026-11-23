import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import ConfirmDialog from '../components/ConfirmDialog'
import { CropIcon, PlusIcon, TrashIcon, UploadIcon } from '../components/Icons'
import BannerAdjustModal from '../components/BannerAdjustModal'
import { bannerImageStyle, sameCrop } from '../bannerCrop'
import { useAuth } from '../context/AuthContext'
import { sortDivisions, tournamentEditPermission } from '../utils'
import { htmlToText, textToHtml } from '../plainText'

// The rich text editor is only needed here, so it loads with this page.
const RichTextEditor = lazy(() => import('../components/RichTextEditor'))

/**
 * Creating and configuring a tournament — Phase 3 REQ-01 and REQ-02.
 *
 * What it runs is set up as competition category groups, each one a gender,
 * then a category, then the weight classes for exactly that pairing. Every
 * ticked class becomes a division, so the form shows how many that will be
 * before it is saved.
 */

const emptyForm = {
  nameAr: '',
  nameEn: '',
  descriptionAr: '',
  descriptionEn: '',
  termsAr: '',
  termsEn: '',
  type: 'local',
  competitionType: 'muaythai_combat',
  locationAr: '',
  locationEn: '',
  startDate: '',
  endDate: '',
  firstBoutTime: '17:00',
  registrationClosesAt: '',
  // The on-site check-in, medical examination and weigh-in, announced on the
  // public page's key dates. Optional; the end is optional too.
  onSiteStartsAt: '',
  onSiteEndsAt: '',
  // Where the website's Activities shows it once published — an Activities
  // category key, chosen here and never derived from the tournament type.
  activityCategory: '',
  // REQ-01 rules 4 to 6 — each group is { id, gender, category, weights },
  // where weights are the upper limits of the classes ticked.
  groups: [],
}

function toDateInput(value) {
  return value ? String(value).slice(0, 10) : ''
}

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

let lastGroupId = 0

function newGroup(fields = {}) {
  lastGroupId += 1
  return { id: lastGroupId, gender: '', category: '', weights: [], ...fields }
}

/** The key the API keeps a pairing's weight classes under. */
function pairKey(group) {
  return `${group.category}:${group.gender}`
}

/** Drops ticked limits that the pairing's official classes do not include. */
function validWeights(weights, classes) {
  if (!classes) return weights
  const offered = new Set(classes.map((entry) => entry.limitKg))
  return weights.filter((limit) => offered.has(limit))
}

/* The groups a saved tournament runs, read from its divisions — which hold
   for tournaments set up before groups existed as much as for those after. */
function groupsFromDivisions(divisions, categoryOrder) {
  const byPair = new Map()
  for (const division of divisions) {
    const key = `${division.category}:${division.gender}`
    if (!byPair.has(key)) byPair.set(key, { gender: division.gender, category: division.category, weights: [] })
    byPair.get(key).weights.push(division.weightLimitKg)
  }

  const rank = (group) => categoryOrder.indexOf(group.category) * 2 + (group.gender === 'female' ? 1 : 0)
  return [...byPair.values()].sort((a, b) => rank(a) - rank(b)).map((group) => newGroup(group))
}

/** The value of the last option in each type list — it opens the add dialog rather than being chosen. */
const ADD_NEW = '__add_new__'

/** Which form field each list fills. */
const FIELD_FOR_KIND = { tournament_type: 'type', competition_type: 'competitionType' }

/** A yyyy-mm-dd date moved back by whole days, in UTC so no time zone shifts it a day. */
function daysBefore(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10)
}

export default function TournamentEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { hasPermission } = useAuth()
  const isNew = !id || id === 'new'
  // A banner chosen while creating the tournament, uploaded once it exists.
  const [pendingBanner, setPendingBanner] = useState(null)
  // How the banner is framed ({ x, y, zoom }, or null for the default). Part of
  // the form: Adjust Image changes it here, and Save sends it.
  const [bannerCrop, setBannerCrop] = useState(null)

  const [form, setForm] = useState(() => ({ ...emptyForm, groups: [newGroup()] }))
  const [options, setOptions] = useState(null)
  const [divisions, setDivisions] = useState([])
  const [tournament, setTournament] = useState(null)
  // The official classes for each gender and category pairing, by pairKey.
  const [classesByPair, setClassesByPair] = useState({})
  // The lists whose dropdown is showing its add-new inputs in its place.
  const [adding, setAdding] = useState([])
  // REQ-01 rule 9 — entries close a set number of days before the first day.
  // Until someone picks a date of their own, that date follows the first day.
  const [closesOverridden, setClosesOverridden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // A banner upload that failed right after creating the tournament.
  const [error, setError] = useState(location.state?.bannerError || '')
  // The form's three tabs; the fields of all three are one form and are saved together.
  const [tab, setTab] = useState('info')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    Promise.all([tournamentsApi.options(), isNew ? null : tournamentsApi.get(id)])
      .then(([optionList, detail]) => {
        if (cancelled) return
        setOptions(optionList)

        if (detail) {
          const t = detail.tournament
          setTournament(t)
          setBannerCrop(t.bannerImageCrop || null)
          setDivisions(detail.divisions)
          const startDate = toDateInput(t.startDate)
          const closes = toDateInput(t.registrationClosesAt)
          setClosesOverridden(
            Boolean(startDate) && closes !== daysBefore(startDate, optionList.defaultRegistrationCloseDays),
          )
          const groups = groupsFromDivisions(
            detail.divisions,
            optionList.categories.map((entry) => entry.value),
          )
          setForm({
            groups: groups.length > 0 ? groups : [newGroup()],
            nameAr: t.nameAr,
            nameEn: t.nameEn,
            descriptionAr: t.descriptionAr || '',
            descriptionEn: t.descriptionEn || '',
            termsAr: t.termsAr || '',
            termsEn: t.termsEn || '',
            type: t.type,
            competitionType: t.competitionType,
            locationAr: t.locationAr,
            locationEn: t.locationEn,
            startDate,
            endDate: toDateInput(t.endDate),
            firstBoutTime: String(t.firstBoutTime || '17:00:00').slice(0, 5),
            registrationClosesAt: closes,
            onSiteStartsAt: toDateTimeInput(t.onSiteCheckInStartsAt),
            onSiteEndsAt: toDateTimeInput(t.onSiteCheckInEndsAt),
            activityCategory: t.activityCategory || '',
          })
        }
      })
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load this tournament.')))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [id, isNew])

  /* The pairings the groups name whose classes have not been fetched yet. */
  const missingPairs = useMemo(
    () =>
      [...new Set(form.groups.filter((group) => group.gender && group.category).map(pairKey))]
        .filter((key) => !(key in classesByPair))
        .join(','),
    [form.groups, classesByPair],
  )

  /* The official weight classes for each pairing (REQ-01 rule 6), from the
     API's mapping. When they arrive, any ticked limit they do not include is
     dropped from the group that named that pairing. */
  useEffect(() => {
    if (!missingPairs) return
    let cancelled = false
    const keys = missingPairs.split(',')

    Promise.all(
      keys.map((key) => {
        const [category, gender] = key.split(':')
        return tournamentsApi.weightClasses(category, gender)
      }),
    )
      .then((lists) => {
        if (cancelled) return
        const fetched = Object.fromEntries(keys.map((key, index) => [key, lists[index]]))
        setClassesByPair((current) => ({ ...current, ...fetched }))
        setForm((current) => ({
          ...current,
          groups: current.groups.map((group) =>
            fetched[pairKey(group)]
              ? { ...group, weights: validWeights(group.weights, fetched[pairKey(group)]) }
              : group,
          ),
        }))
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [missingPairs])

  /* How many divisions the current choices produce (REQ-02 rule 5). */
  const divisionCount = form.groups.reduce((total, group) => total + group.weights.length, 0)

  // What the API asks of a save: "Create & edit tournaments" for a draft,
  // "Approve, publish & edit published tournaments" once it is published.
  // Without it the page is for reading. Adding to either type list is the
  // first of those in every case.
  const editPermission = tournamentEditPermission(isNew ? null : tournament)
  const canEdit = hasPermission(editPermission)
  const canAddOption = canEdit && hasPermission('tournament.manage')

  /* The saved divisions as listed: Female then Male, youngest category to
     oldest, lightest class to heaviest. */
  const orderedDivisions = useMemo(
    () =>
      sortDivisions(
        divisions,
        (options?.categories || []).map((entry) => entry.value),
      ),
    [divisions, options],
  )

  /* True when another group already runs this gender and category. */
  function pairTaken(gender, category, exceptId) {
    return form.groups.some((group) => group.id !== exceptId && group.gender === gender && group.category === category)
  }

  function changeGroup(groupId, changes) {
    setForm((current) => ({
      ...current,
      groups: current.groups.map((group) => {
        if (group.id !== groupId) return group
        const next = { ...group, ...changes }
        // A new pairing keeps only the ticked classes it also offers; until
        // its classes arrive, the fetch above does the same.
        if (('gender' in changes || 'category' in changes) && pairKey(next) !== pairKey(group)) {
          next.weights = validWeights(next.weights, classesByPair[pairKey(next)])
        }
        return next
      }),
    }))
  }

  function toggleWeight(groupId, limit) {
    setForm((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id !== groupId
          ? group
          : {
              ...group,
              weights: group.weights.includes(limit)
                ? group.weights.filter((value) => value !== limit)
                : [...group.weights, limit],
            },
      ),
    }))
  }

  function addGroup() {
    setForm((current) => ({ ...current, groups: [...current.groups, newGroup()] }))
  }

  function removeGroup(groupId) {
    setForm((current) => ({ ...current, groups: current.groups.filter((group) => group.id !== groupId) }))
  }

  /* Resolves to an error message, or to nothing once the entry is saved,
     chosen, and its dropdown is back. */
  async function addOption(kind, nameAr, nameEn) {
    try {
      const entry = await tournamentsApi.addOption(kind, { nameAr, nameEn })
      setOptions(await tournamentsApi.options())
      // The new entry is what the user was reaching for, so it is chosen.
      update(FIELD_FOR_KIND[kind], entry.value)
      closeAdding(kind)
      return ''
    } catch (err) {
      return extractErrorMessage(err, 'Could not add that option.')
    }
  }

  function closeAdding(kind) {
    setAdding((current) => current.filter((entry) => entry !== kind))
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  /* A type dropdown's change: its last option swaps the dropdown for the
     add-new inputs instead of being chosen, and the value stays what it was. */
  function chooseOption(kind, value) {
    if (value === ADD_NEW) setAdding((current) => [...current, kind])
    else update(FIELD_FOR_KIND[kind], value)
  }

  function defaultCloses(startDate) {
    return startDate ? daysBefore(startDate, options?.defaultRegistrationCloseDays ?? 7) : ''
  }

  /* Moving the first day moves the closing date with it, unless someone has
     set the closing date themselves. */
  function changeStartDate(value) {
    setForm((current) => ({
      ...current,
      startDate: value,
      registrationClosesAt: closesOverridden ? current.registrationClosesAt : defaultCloses(value),
    }))
  }

  /* Clearing the closing date hands it back to the default. */
  function changeCloses(value) {
    setClosesOverridden(Boolean(value))
    update('registrationClosesAt', value || defaultCloses(form.startDate))
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setError('The last day cannot be earlier than the first day.')
      showProblem('dates')
      return
    }

    if (form.groups.length === 0) {
      setError('Add at least one competition category.')
      showProblem('categories')
      return
    }

    const incomplete = form.groups.findIndex((group) => !group.gender || !group.category || group.weights.length === 0)
    if (incomplete >= 0) {
      setError(`Category ${incomplete + 1} needs a gender, a category and at least one weight class.`)
      showProblem('categories')
      return
    }

    if (form.onSiteEndsAt && !form.onSiteStartsAt) {
      setError('Set when on-site check-in, medical examination and weigh-in starts before its end.')
      showProblem('dates')
      return
    }
    if (form.onSiteStartsAt && form.onSiteEndsAt && form.onSiteEndsAt <= form.onSiteStartsAt) {
      setError('On-site check-in, medical examination and weigh-in must end after it starts.')
      showProblem('dates')
      return
    }

    setSaving(true)

    const { groups, onSiteStartsAt, onSiteEndsAt, ...fields } = form
    const body = {
      ...fields,
      firstBoutTime: `${form.firstBoutTime}:00`,
      registrationClosesAt: form.registrationClosesAt || null,
      // Always sent from this form, so clearing the fields clears the window.
      onSiteSchedule: { startsAt: onSiteStartsAt || null, endsAt: onSiteEndsAt || null },
      // The groups, in the shape the API already stores: the genders and
      // categories run, and the classes per pairing. Exact, because a pairing
      // no group names is not run.
      genders: [...new Set(groups.map((group) => group.gender))],
      categories: [...new Set(groups.map((group) => group.category))],
      weightClasses: Object.fromEntries(groups.map((group) => [pairKey(group), group.weights])),
      exactWeightClasses: true,
    }
    // The banner's position, for the image it was chosen on. Without one the
    // stored position is left as it is.
    if (!isNew && bannerCrop && tournament?.bannerImageUrl) {
      body.bannerImageCrop = { ...bannerCrop, imageUrl: tournament.bannerImageUrl }
    }

    try {
      if (isNew) {
        const created = await tournamentsApi.create(body)
        let bannerError = ''
        if (pendingBanner) {
          try {
            // The position picked before the tournament existed travels with its image.
            const saved = await tournamentsApi.uploadTournamentBanner(created.id, pendingBanner, bannerCrop)
            if (bannerCrop && !sameCrop(saved?.bannerImageCrop, bannerCrop)) bannerError = BANNER_POSITION_NOT_SAVED
          } catch (err) {
            bannerError = `The tournament was created, but the banner was not saved: ${extractErrorMessage(err, 'upload failed.')}`
          }
        }
        navigate(`/tournaments/${created.id}`, { state: bannerError ? { bannerError } : null })
      } else {
        await tournamentsApi.update(id, body)
        const detail = await tournamentsApi.get(id)
        setTournament(detail.tournament)
        setDivisions(detail.divisions)
        // The server's copy is the truth. A position that was sent but did not
        // come back was not stored (an API without banner positions ignores
        // the field) — say so, and keep the adjustment on screen as unsaved
        // rather than quietly putting the old framing back.
        const sent = body.bannerImageCrop
        if (sent && !sameCrop(detail.tournament.bannerImageCrop, sent)) {
          setError(BANNER_POSITION_NOT_SAVED)
          showProblem('info')
        } else {
          setBannerCrop(detail.tournament.bannerImageCrop || null)
          setNotice('Saved.')
        }
      }
    } catch (err) {
      const message = extractErrorMessage(err, 'Could not save this tournament.')
      setError(message)
      showProblem(tabForMessage(message))
    } finally {
      setSaving(false)
    }
  }

  /* A problem with the form opens the tab it is about and brings the message
     into view. */
  function showProblem(tabKey) {
    if (tabKey) setTab(tabKey)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* The browser's own checks (a required field, a date outside its range)
     stop the save on the first invalid field — which may be on a tab that is
     not shown. Open that tab, then let the browser point at the field. */
  const reporting = useRef(false)
  function onInvalid(event) {
    if (reporting.current) return
    const panel = event.target.closest('[data-tab]')
    if (!panel) return
    reporting.current = true
    setTab(panel.dataset.tab)
    const field = event.target
    setTimeout(() => {
      field.reportValidity()
      reporting.current = false
    }, 0)
  }

  async function publish() {
    setError('')
    try {
      const updated = await tournamentsApi.publish(id)
      setTournament(updated)
      setNotice('Published — the tournament is open for entries.')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not publish this tournament.'))
    }
  }

  if (loading) return <Spinner label="Loading…" />

  return (
    <div className="te-page">
      <PageHeader
        title={isNew ? 'New tournament' : tournament?.nameEn || 'Tournament'}
        description={
          isNew
            ? 'Name it, choose what it runs, then publish it to open entries.'
            : `${tournament?.locationEn} · ${tournament?.statusEn}`
        }
        actions={
          !isNew && (
            <div className="chip-list">
              {tournament?.status === 'draft' && hasPermission('tournament.approve') && (
                <button type="button" className="btn btn--primary" onClick={publish}>
                  Publish &amp; open entries
                </button>
              )}
              <a className="btn btn--ghost" href={`/tournaments/${id}/entries`}>
                Entries
              </a>
            </div>
          )
        }
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      <form onSubmit={save} onInvalidCapture={onInvalid} className="form-card te-form">
        {!canEdit && (
          <p className="form-card__intro form-card__readonly">
            {editPermission === 'tournament.approve'
              ? 'This tournament has been published. Editing it now needs the “Approve, publish & edit published tournaments” permission, which your account does not have.'
              : 'Editing a draft tournament needs the “Create & edit tournaments” permission, which your account does not have.'}
          </p>
        )}

        <fieldset className="form-fieldset" disabled={!canEdit}>
          <FormTabs active={tab} onChange={setTab} />

          {/* All three panels stay mounted, so switching tabs never loses what
            was typed; only the chosen one is shown. */}
          <div
            className="te-panel"
            role="tabpanel"
            id="te-panel-info"
            aria-labelledby="te-tab-info"
            data-tab="info"
            hidden={tab !== 'info'}
          >
            <BannerField
              tournamentId={isNew ? null : id}
              url={tournament?.bannerImageUrl || null}
              crop={bannerCrop}
              savedCrop={tournament?.bannerImageCrop || null}
              pending={pendingBanner}
              onPending={setPendingBanner}
              onChanged={(saved) =>
                setTournament((t) => ({
                  ...t,
                  bannerImageUrl: saved?.bannerImageUrl || null,
                  bannerImageCrop: saved?.bannerImageCrop || null,
                }))
              }
              onCrop={setBannerCrop}
              disabled={!canEdit}
            />

            <div className="form-grid">
              <label className="field">
                <span>Name (Arabic)</span>
                <input
                  type="text"
                  dir="rtl"
                  value={form.nameAr}
                  onChange={(e) => update('nameAr', e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Name (English)</span>
                <input type="text" value={form.nameEn} onChange={(e) => update('nameEn', e.target.value)} required />
              </label>
            </div>

            <div className="form-grid">
              {adding.includes('tournament_type') ? (
                <InlineAddOption
                  label="Tournament type"
                  noun="tournament type"
                  onCancel={() => closeAdding('tournament_type')}
                  onSave={(nameAr, nameEn) => addOption('tournament_type', nameAr, nameEn)}
                />
              ) : (
                <label className="field">
                  <span>Tournament type</span>
                  <select
                    className="field__select"
                    value={form.type}
                    onChange={(e) => chooseOption('tournament_type', e.target.value)}
                  >
                    {options?.types.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.en}
                      </option>
                    ))}
                    {/* Rule 2 — the list is the federation's to extend. */}
                    {canAddOption && <option value={ADD_NEW}>+ Add new tournament type</option>}
                  </select>
                </label>
              )}
              {adding.includes('competition_type') ? (
                <InlineAddOption
                  label="Competition type"
                  noun="competition type"
                  onCancel={() => closeAdding('competition_type')}
                  onSave={(nameAr, nameEn) => addOption('competition_type', nameAr, nameEn)}
                />
              ) : (
                <label className="field">
                  <span>Competition type</span>
                  <select
                    className="field__select"
                    value={form.competitionType}
                    onChange={(e) => chooseOption('competition_type', e.target.value)}
                  >
                    {options?.competitionTypes.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.en}
                      </option>
                    ))}
                    {/* Rule 3 — likewise. */}
                    {canAddOption && <option value={ADD_NEW}>+ Add new competition type</option>}
                  </select>
                </label>
              )}
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Location (Arabic)</span>
                <input
                  type="text"
                  dir="rtl"
                  value={form.locationAr}
                  onChange={(e) => update('locationAr', e.target.value)}
                />
              </label>
              <label className="field">
                <span>Location (English)</span>
                <input type="text" value={form.locationEn} onChange={(e) => update('locationEn', e.target.value)} />
              </label>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Tournament display location</span>
                <select
                  className="field__select"
                  value={form.activityCategory}
                  onChange={(e) => update('activityCategory', e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Choose where it is shown
                  </option>
                  {options?.activityCategories.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.en} — {entry.ar}
                    </option>
                  ))}
                </select>
                <span className="field__hint">
                  The website&apos;s Activities category it appears under once published, as well as under All.
                </span>
              </label>
            </div>

            <BilingualEditorField
              label="Description"
              plain
              fields={['descriptionAr', 'descriptionEn']}
              values={[form.descriptionAr, form.descriptionEn]}
              onChange={update}
              disabled={!canEdit}
              hint="Paragraphs and lists, as the website shows them."
            />

            <BilingualEditorField
              label="Terms & Conditions"
              fields={['termsAr', 'termsEn']}
              values={[form.termsAr, form.termsEn]}
              onChange={update}
              disabled={!canEdit}
              hint="Optional. Shown on the tournament's public page under Terms & Conditions, in the visitor's language (or the other one when only one is written)."
            />
          </div>

          <div
            className="te-panel"
            role="tabpanel"
            id="te-panel-dates"
            aria-labelledby="te-tab-dates"
            data-tab="dates"
            hidden={tab !== 'dates'}
          >
            <div className="form-grid">
              <label className="field">
                <span>First day</span>
                <input type="date" value={form.startDate} onChange={(e) => changeStartDate(e.target.value)} required />
              </label>
              <label className="field">
                <span>Last day</span>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(e) => update('endDate', e.target.value)}
                  required
                />
                {form.startDate && form.endDate && form.endDate < form.startDate && (
                  <span className="field__hint">The last day cannot be earlier than the first day.</span>
                )}
              </label>
              <label className="field">
                <span>First bout starts</span>
                <input
                  type="time"
                  className="field__time"
                  value={form.firstBoutTime}
                  onChange={(e) => update('firstBoutTime', e.target.value)}
                />
              </label>
              <label className="field">
                <span>Entries close</span>
                <input
                  type="date"
                  value={form.registrationClosesAt}
                  max={form.startDate || undefined}
                  onChange={(e) => changeCloses(e.target.value)}
                />
                <span className="field__hint">
                  {closesOverridden ? (
                    <>
                      Set by hand.{' '}
                      <button type="button" className="link-btn" onClick={() => changeCloses('')}>
                        Use the default
                      </button>
                    </>
                  ) : (
                    `${options?.defaultRegistrationCloseDays} days before the first day by default. Change it to set another date.`
                  )}
                </span>
              </label>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>On-site Check-in, Medical &amp; Weigh-in — Starts</span>
                <input
                  type="datetime-local"
                  value={form.onSiteStartsAt}
                  max={form.endDate ? `${form.endDate}T23:59` : undefined}
                  onChange={(e) => update('onSiteStartsAt', e.target.value)}
                />
                <span className="field__hint">Optional. Shown in the public page&apos;s Key Dates once set.</span>
              </label>
              <label className="field">
                <span>On-site Check-in, Medical &amp; Weigh-in — Ends (optional)</span>
                <input
                  type="datetime-local"
                  value={form.onSiteEndsAt}
                  min={form.onSiteStartsAt || undefined}
                  disabled={!form.onSiteStartsAt && !form.onSiteEndsAt}
                  onChange={(e) => update('onSiteEndsAt', e.target.value)}
                />
                <span className="field__hint">The time it finishes, if there is one.</span>
              </label>
            </div>
          </div>

          <div
            className="te-panel"
            role="tabpanel"
            id="te-panel-categories"
            aria-labelledby="te-tab-categories"
            data-tab="categories"
            hidden={tab !== 'categories'}
          >
            <p className="form-card__intro">
              Set up each category on its own: gender, then category, then the weight classes it runs. Every weight
              class ticked becomes a division.
            </p>

            <div className="cat-groups">
              {form.groups.map((group, index) => {
                const category = options?.categories.find((entry) => entry.value === group.category)
                const classes = group.gender && group.category ? classesByPair[pairKey(group)] : null
                const allOn = Boolean(classes?.length) && group.weights.length === classes.length

                return (
                  <div className="cat-group" key={group.id}>
                    <div className="cat-group__head">
                      <span className="cat-group__title">Category {index + 1}</span>
                      {group.gender && category && (
                        <span className="cat-group__summary">
                          {group.gender === 'female' ? 'Female' : 'Male'} → {category.en} →{' '}
                          {group.weights.length === 1 ? '1 weight class' : `${group.weights.length} weight classes`}
                        </span>
                      )}
                      {form.groups.length > 1 && (
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger cat-group__remove"
                          title="Remove this category"
                          aria-label={`Remove category ${index + 1}`}
                          onClick={() => removeGroup(group.id)}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>

                    <div className="cat-group__picks">
                      <label className="field">
                        <span>Gender</span>
                        <select
                          className="field__select"
                          value={group.gender}
                          onChange={(e) => changeGroup(group.id, { gender: e.target.value })}
                        >
                          <option value="" disabled>
                            Choose gender
                          </option>
                          {GENDERS.map((entry) => (
                            <option
                              key={entry.value}
                              value={entry.value}
                              disabled={Boolean(group.category) && pairTaken(entry.value, group.category, group.id)}
                            >
                              {entry.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Category</span>
                        <select
                          className="field__select"
                          value={group.category}
                          disabled={!group.gender}
                          onChange={(e) => changeGroup(group.id, { category: e.target.value })}
                        >
                          <option value="" disabled>
                            {group.gender ? 'Choose category' : 'Choose a gender first'}
                          </option>
                          {options?.categories.map((entry) => {
                            const taken = pairTaken(group.gender, entry.value, group.id)
                            return (
                              <option key={entry.value} value={entry.value} disabled={taken}>
                                {entry.en}
                                {taken ? ' (already added)' : ''}
                              </option>
                            )
                          })}
                        </select>
                      </label>
                    </div>

                    {group.gender && group.category && (
                      <div className="cat-group__weights">
                        <span className="cat-group__label">
                          Weight classes
                          {classes?.length > 0 && (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() =>
                                changeGroup(group.id, { weights: allOn ? [] : classes.map((entry) => entry.limitKg) })
                              }
                            >
                              {allOn ? 'Clear all' : 'Select all'}
                            </button>
                          )}
                        </span>
                        {!classes ? (
                          <span className="field__hint">Loading the official weight classes…</span>
                        ) : classes.length === 0 ? (
                          <span className="field__hint">No official weight classes for this pairing.</span>
                        ) : (
                          <div className="weights__list">
                            {classes.map((entry) => {
                              const on = group.weights.includes(entry.limitKg)
                              return (
                                <button
                                  key={String(entry.limitKg)}
                                  type="button"
                                  className={`weights__chip${on ? ' is-on' : ''}`}
                                  aria-pressed={on}
                                  onClick={() => toggleWeight(group.id, entry.limitKg)}
                                >
                                  {entry.labelEn}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button type="button" className="btn btn--ghost btn--small cat-groups__add" onClick={addGroup}>
              <PlusIcon /> Add another category
            </button>

            {divisionCount > 0 && (
              <p className="form-card__intro">
                That makes <strong>{divisionCount}</strong> divisions — one per weight class ticked.
              </p>
            )}
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/tournaments')}>
            Back
          </button>
          {canEdit && (
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create tournament' : 'Save changes'}
            </button>
          )}
        </div>
      </form>

      {!isNew && divisions.length > 0 && (
        <section className="form-card">
          <h3 className="form-section-title form-section-title--first">Divisions</h3>
          <p className="form-card__intro">{divisions.length} divisions. Each one is drawn and scheduled on its own.</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Division</th>
                  <th>Entries</th>
                  <th>Draw</th>
                </tr>
              </thead>
              <tbody>
                {orderedDivisions.map((division) => (
                  <tr key={division.id}>
                    <td>{division.labelEn}</td>
                    <td>{division.entries}</td>
                    <td>
                      {division.drawPublishedAt ? (
                        <Badge tone="green">Published</Badge>
                      ) : division.entries > 0 ? (
                        <Badge tone="neutral">Not drawn</Badge>
                      ) : (
                        <span className="data-table__subtext">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * REQ-01 rules 2 and 3 — adding to one of the two lists, in the place of its
 * dropdown. The list needs the name in both languages.
 */
function InlineAddOption({ label, noun, onCancel, onSave }) {
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const ready = nameAr.trim() && nameEn.trim() && !saving

  async function save() {
    if (!ready) return
    setSaving(true)
    setError('')
    const problem = await onSave(nameAr.trim(), nameEn.trim())
    // On success this component is already gone.
    if (problem) {
      setError(problem)
      setSaving(false)
    }
  }

  /* Enter would otherwise submit the whole tournament form. */
  function onKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="field">
      <span>{label}</span>
      <div className="inline-add">
        <input
          type="text"
          dir="rtl"
          autoFocus
          placeholder="الاسم بالعربية"
          aria-label={`New ${noun} (Arabic)`}
          value={nameAr}
          onChange={(event) => setNameAr(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <input
          type="text"
          placeholder="Name in English"
          aria-label={`New ${noun} (English)`}
          value={nameEn}
          onChange={(event) => setNameEn(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="inline-add__actions">
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary btn--small" onClick={save} disabled={!ready}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <span className="field__hint field__hint--error">{error}</span>}
    </div>
  )
}

const BANNER_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const BANNER_POSITION_NOT_SAVED =
  'The tournament was saved, but the server did not store the banner position. It is still shown as unsaved. ' +
  'If this keeps happening, the API needs to be restarted with the current version.'
const BANNER_MAX_BYTES = 5 * 1024 * 1024

/**
 * The tournament's optional banner for its public page. A chosen image opens
 * Adjust Image first, to place it in the banner frame; Apply then uploads it
 * on a saved tournament (replacing the current one), or holds it while
 * creating, to be uploaded as soon as the tournament exists. Cancel leaves the
 * banner as it was. Adjust Image also repositions the current banner without
 * a new upload. Remove takes it off (the page then shows the plain green
 * header). The API checks type and size again.
 *
 * The position itself is part of the form: Apply only updates the preview, and
 * the form's Save keeps it — so leaving without saving keeps the old one.
 */
function BannerField({ tournamentId, url, crop, savedCrop, pending, onPending, onChanged, onCrop, disabled }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [inputKey, setInputKey] = useState(0)
  // Adjust Image: { src, file } for a newly chosen image, { src } for the current one.
  const [adjusting, setAdjusting] = useState(null)
  const [adjustError, setAdjustError] = useState('')
  const pendingUrl = useMemo(() => (pending ? URL.createObjectURL(pending) : null), [pending])
  useEffect(() => () => pendingUrl && URL.revokeObjectURL(pendingUrl), [pendingUrl])
  const preview = pendingUrl || url
  const unsaved = Boolean(tournamentId && url && !sameCrop(crop, savedCrop))

  function pick(file) {
    setError('')
    setInputKey((k) => k + 1)
    if (!file) return
    if (!BANNER_TYPES.includes(file.type)) {
      setError('Choose a JPG, PNG or WebP image.')
      return
    }
    if (file.size > BANNER_MAX_BYTES) {
      setError('The image is larger than 5 MB.')
      return
    }
    setAdjustError('')
    setAdjusting({ src: URL.createObjectURL(file), file })
  }

  function closeAdjust() {
    if (adjusting?.file) URL.revokeObjectURL(adjusting.src)
    setAdjusting(null)
    setAdjustError('')
  }

  async function apply(position) {
    const file = adjusting?.file
    if (!file) {
      // Repositioning the current image: the preview changes, Save keeps it.
      onCrop(position)
      closeAdjust()
      return
    }
    if (!tournamentId) {
      onPending(file)
      onCrop(position)
      closeAdjust()
      return
    }
    setBusy(true)
    setAdjustError('')
    try {
      // The image is stored at once, as before; the API starts it from the
      // default framing, and the position chosen here waits for Save.
      const saved = await tournamentsApi.uploadTournamentBanner(tournamentId, file)
      onChanged(saved)
      onCrop(position)
      closeAdjust()
    } catch (err) {
      setAdjustError(extractErrorMessage(err, 'Could not upload the banner.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setConfirming(false)
    if (!tournamentId) {
      onPending(null)
      onCrop(null)
      return
    }
    setBusy(true)
    setError('')
    try {
      const saved = await tournamentsApi.removeTournamentBanner(tournamentId)
      onChanged(saved)
      onCrop(null)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not remove the banner.'))
    } finally {
      setBusy(false)
    }
  }

  const [over, setOver] = useState(false)
  const inactive = disabled || busy

  const input = (
    <input
      key={inputKey}
      type="file"
      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
      hidden
      disabled={inactive}
      onChange={(event) => pick(event.target.files?.[0] || null)}
    />
  )

  return (
    <div className="field banner-field">
      <span>Tournament Banner Image (optional)</span>
      {preview ? (
        <>
          <div className="banner-field__preview">
            <img src={preview} alt="Tournament banner preview" style={bannerImageStyle(crop)} />
          </div>
          <div className="banner-field__actions">
            <button
              type="button"
              className="btn btn--secondary btn--small"
              disabled={inactive}
              onClick={() => {
                setError('')
                setAdjustError('')
                setAdjusting({ src: preview })
              }}
            >
              <CropIcon /> Adjust Image
            </button>
            <label className={`btn btn--secondary btn--small${inactive ? ' btn--disabled' : ''}`}>
              <UploadIcon /> {busy ? 'Saving…' : 'Replace image'}
              {input}
            </label>
            <button
              type="button"
              className="btn btn--ghost btn--small banner-field__remove"
              disabled={inactive}
              onClick={() => setConfirming(true)}
            >
              <TrashIcon /> Remove
            </button>
            <span className="banner-field__hint">
              {!tournamentId ? 'Saved with the tournament. ' : ''}JPG, PNG or WebP, up to 5 MB.
            </span>
          </div>
          {unsaved && (
            <p className="banner-field__unsaved" role="status">
              The new banner position is shown above. Click <strong>Save</strong> to keep it.
            </p>
          )}
        </>
      ) : (
        <label
          className={`banner-field__drop${over ? ' is-over' : ''}${inactive ? ' is-disabled' : ''}`}
          onDragOver={(event) => {
            if (inactive) return
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            if (!inactive) pick(event.dataTransfer.files?.[0] || null)
          }}
        >
          <span className="banner-field__drop-icon" aria-hidden="true">
            <UploadIcon />
          </span>
          <span className="banner-field__drop-text">
            <strong>No banner yet</strong>
            <span>
              JPG, PNG or WebP, up to 5 MB — a wide image (about 1600×500) works best. Without one, the public page
              shows the plain green header.
            </span>
          </span>
          <span className={`btn btn--primary btn--small${inactive ? ' btn--disabled' : ''}`}>
            <UploadIcon /> {busy ? 'Saving…' : 'Upload Image'}
          </span>
          {input}
        </label>
      )}
      {error && (
        <p className="pt-error" role="alert">
          {error}
        </p>
      )}
      {adjusting && (
        <BannerAdjustModal
          src={adjusting.src}
          // A new image starts centred; the current one from where it is now.
          initial={adjusting.file ? null : crop}
          busy={busy}
          error={adjustError}
          applyLabel={adjusting.file && tournamentId ? 'Apply and upload' : 'Apply'}
          onCancel={closeAdjust}
          onApply={apply}
        />
      )}
      <ConfirmDialog
        open={confirming}
        title="Remove the banner?"
        description="The public page will show the plain green header instead."
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
        busy={busy}
      />
    </div>
  )
}

/** "2026-07-26T10:00" for a datetime-local input, from the API's date-time. */
function toDateTimeInput(value) {
  return value ? String(value).slice(0, 16) : ''
}

/** Which tab a message from the server is about, when it says. */
function tabForMessage(message) {
  if (/categor|weight|division|gender/i.test(message)) return 'categories'
  if (/date|day|close|on-site|weigh-in|medical|time/i.test(message)) return 'dates'
  if (/name|type|location|description|terms|banner|display/i.test(message)) return 'info'
  return null
}

const FORM_TABS = [
  { key: 'info', label: 'Tournament Information' },
  { key: 'dates', label: 'Dates & Times' },
  { key: 'categories', label: 'Competition Categories' },
]

/**
 * The form's tabs: plain labels on a light baseline, with one green underline
 * that slides to the chosen tab while its label lifts a little — the same
 * quiet navigation as the public tournament page.
 */
function FormTabs({ active, onChange }) {
  const row = useRef(null)
  const [ink, setInk] = useState(null)

  useLayoutEffect(() => {
    const list = row.current
    if (!list) return undefined
    const place = () => {
      const tab = list.querySelector(`#te-tab-${active}`)
      if (!tab) return
      setInk((prev) => {
        const next = { left: tab.offsetLeft, width: tab.offsetWidth }
        return prev && prev.left === next.left && prev.width === next.width ? prev : { ...next, ready: Boolean(prev) }
      })
    }
    place()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    observer?.observe(list)
    return () => observer?.disconnect()
  }, [active])

  function onKeyDown(event, index) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = FORM_TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + FORM_TABS.length) % FORM_TABS.length]
    onChange(next.key)
    document.getElementById(`te-tab-${next.key}`)?.focus()
  }

  return (
    <div className="te-tabs">
      <div className="te-tabs__list" role="tablist" aria-label="Tournament form sections" ref={row}>
        {FORM_TABS.map((entry, index) => (
          <button
            key={entry.key}
            id={`te-tab-${entry.key}`}
            type="button"
            role="tab"
            aria-selected={active === entry.key}
            aria-controls={`te-panel-${entry.key}`}
            tabIndex={active === entry.key ? 0 : -1}
            className={`te-tabs__tab${active === entry.key ? ' is-active' : ''}`}
            onClick={() => onChange(entry.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="te-tabs__label">{entry.label}</span>
          </button>
        ))}
        {ink && (
          <span
            className={`te-tabs__ink${ink.ready ? ' is-ready' : ''}`}
            style={{ width: ink.width, transform: `translateX(${ink.left}px)` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )
}

/**
 * One field written in both languages, in the shared rich text editor: an
 * Arabic / English switch at its top right and one editor per language.
 * Both editors stay mounted, so switching keeps each one's text, cursor and
 * undo history, and neither language can overwrite the other.
 *
 * `plain` is for text stored as plain text (the description): the editor is
 * limited to paragraphs and lists, and its HTML is turned back into the same
 * plain text the website already reads — so nothing about how a description
 * is stored or shown changes.
 */
function BilingualEditorField({ label, fields, values, onChange, disabled, hint, plain = false }) {
  const [language, setLanguage] = useState('ar')
  const slug = fields[0].replace(/Ar$/, '')
  const languages = [
    { key: 'ar', label: 'Arabic', field: fields[0], value: values[0], dir: 'rtl' },
    { key: 'en', label: 'English', field: fields[1], value: values[1], dir: 'ltr' },
  ]
  const hasText = (value) => Boolean(value && value.replace(/<[^>]*>/g, '').trim())

  return (
    <div className="field terms-field">
      <div className="terms-field__head">
        <span>{label}</span>
        <div className="terms-field__langs" role="tablist" aria-label={`${label} language`}>
          {languages.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              id={`${slug}-tab-${entry.key}`}
              aria-selected={language === entry.key}
              aria-controls={`${slug}-panel-${entry.key}`}
              className={`terms-field__lang${language === entry.key ? ' is-active' : ''}`}
              onClick={() => setLanguage(entry.key)}
            >
              {entry.label}
              {hasText(entry.value) && <span className="terms-field__dot" aria-label="(has content)" />}
            </button>
          ))}
        </div>
      </div>
      {languages.map((entry) => (
        <div
          key={entry.key}
          role="tabpanel"
          id={`${slug}-panel-${entry.key}`}
          aria-labelledby={`${slug}-tab-${entry.key}`}
          hidden={language !== entry.key}
        >
          <Suspense fallback={<div className="rte rte--loading" aria-busy="true" />}>
            {plain ? (
              <PlainTextEditor
                value={entry.value}
                onChange={(text) => onChange(entry.field, text)}
                dir={entry.dir}
                label={`${label} (${entry.label})`}
                disabled={disabled}
              />
            ) : (
              <RichTextEditor
                value={entry.value}
                onChange={(html) => onChange(entry.field, html)}
                dir={entry.dir}
                label={`${label} (${entry.label})`}
                disabled={disabled}
              />
            )}
          </Suspense>
        </div>
      ))}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  )
}

/**
 * The editor for a plain-text value. The text becomes editor HTML on the way
 * in and plain text again on the way out; the HTML it last produced is kept,
 * so its own echo is not mistaken for new content (which would move the
 * cursor). An untouched description is never rewritten.
 */
function PlainTextEditor({ value, onChange, ...props }) {
  const last = useRef({ text: null, html: '' })
  const html = value === last.current.text ? last.current.html : textToHtml(value)
  return (
    <RichTextEditor
      {...props}
      mode="plain"
      value={html}
      onChange={(next) => {
        const text = htmlToText(next)
        last.current = { text, html: next }
        onChange(text)
      }}
    />
  )
}
