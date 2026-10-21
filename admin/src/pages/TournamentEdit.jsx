import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { tournamentsApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'

/**
 * Creating and configuring a tournament — Phase 3 REQ-01 and REQ-02.
 *
 * The categories and genders chosen here are what generate the divisions, so
 * the form shows how many that will be before it is saved: picking four
 * categories across both genders is forty-odd divisions, and that is worth
 * seeing in advance.
 */

const emptyForm = {
  nameAr: '',
  nameEn: '',
  type: 'local',
  competitionType: 'muaythai_combat',
  locationAr: '',
  locationEn: '',
  startDate: '',
  endDate: '',
  firstBoutTime: '17:00',
  registrationClosesAt: '',
  genders: ['male'],
  categories: [],
  // REQ-01 rule 6 — which classes to run, keyed "category:gender". Empty
  // means every class that pairing offers.
  weightClasses: {},
}

function toDateInput(value) {
  return value ? String(value).slice(0, 10) : ''
}

export default function TournamentEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const [form, setForm] = useState(emptyForm)
  const [options, setOptions] = useState(null)
  const [divisions, setDivisions] = useState([])
  const [tournament, setTournament] = useState(null)
  // The classes each pairing offers, so they can be ticked individually.
  const [available, setAvailable] = useState({})
  const [addingType, setAddingType] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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
          setDivisions(detail.divisions)
          setForm({
            weightClasses: detail.weightClasses || {},
            nameAr: t.nameAr,
            nameEn: t.nameEn,
            type: t.type,
            competitionType: t.competitionType,
            locationAr: t.locationAr,
            locationEn: t.locationEn,
            startDate: toDateInput(t.startDate),
            endDate: toDateInput(t.endDate),
            firstBoutTime: String(t.firstBoutTime || '17:00:00').slice(0, 5),
            registrationClosesAt: toDateInput(t.registrationClosesAt),
            genders: detail.genders,
            categories: detail.categories,
          })
        }
      })
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load this tournament.')))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [id, isNew])

  /* The weight classes each category and gender offers (REQ-01 rule 6). */
  useEffect(() => {
    if (!options || form.categories.length === 0 || form.genders.length === 0) {
      setAvailable({})
      return
    }

    let cancelled = false
    const pairs = form.categories.flatMap((category) => form.genders.map((gender) => [category, gender]))

    Promise.all(pairs.map(([category, gender]) => tournamentsApi.weightClasses(category, gender)))
      .then((lists) => {
        if (cancelled) return
        const next = {}
        pairs.forEach(([category, gender], index) => {
          next[`${category}:${gender}`] = lists[index]
        })
        setAvailable(next)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [options, form.categories, form.genders])

  /* How many divisions the current choices produce (REQ-02 rule 5). A pairing
     with nothing ticked runs every class it offers. */
  const divisionCount = useMemo(
    () =>
      Object.entries(available).reduce((total, [key, classes]) => {
        const chosen = form.weightClasses[key]
        return total + (chosen && chosen.length > 0 ? chosen.length : classes.length)
      }, 0),
    [available, form.weightClasses],
  )

  function toggleWeight(key, limit) {
    setForm((current) => {
      const chosen = current.weightClasses[key] || []
      const has = chosen.some((value) => value === limit)
      const next = has ? chosen.filter((value) => value !== limit) : [...chosen, limit]
      return { ...current, weightClasses: { ...current.weightClasses, [key]: next } }
    })
  }

  async function addOption(kind, nameAr, nameEn) {
    setError('')
    try {
      await tournamentsApi.addOption(kind, { nameAr, nameEn })
      setOptions(await tournamentsApi.options())
      setAddingType(null)
      setNotice('Added to the list.')
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not add that option.'))
    }
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function toggle(field, value) {
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((entry) => entry !== value)
        : [...current[field], value],
    }))
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)

    const body = {
      ...form,
      firstBoutTime: `${form.firstBoutTime}:00`,
      registrationClosesAt: form.registrationClosesAt || null,
    }

    try {
      if (isNew) {
        const created = await tournamentsApi.create(body)
        navigate(`/tournaments/${created.id}`)
      } else {
        await tournamentsApi.update(id, body)
        const detail = await tournamentsApi.get(id)
        setTournament(detail.tournament)
        setDivisions(detail.divisions)
        setNotice('Saved.')
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save this tournament.'))
    } finally {
      setSaving(false)
    }
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

  const categoriesByTrack = (options?.categories || []).reduce((groups, category) => {
    ;(groups[category.track] ||= []).push(category)
    return groups
  }, {})

  return (
    <div>
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
              {tournament?.status === 'draft' && (
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

      <form onSubmit={save} className="form-card">
        <div className="form-grid">
          <label className="field">
            <span>Name (Arabic)</span>
            <input type="text" dir="rtl" value={form.nameAr} onChange={(e) => update('nameAr', e.target.value)} required />
          </label>
          <label className="field">
            <span>Name (English)</span>
            <input type="text" value={form.nameEn} onChange={(e) => update('nameEn', e.target.value)} required />
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Tournament type</span>
            <select value={form.type} onChange={(e) => update('type', e.target.value)}>
              {options?.types.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.en}
                </option>
              ))}
            </select>
            {/* Rule 2 — the list is the federation's to extend. */}
            <button type="button" className="link-btn" onClick={() => setAddingType('tournament_type')}>
              Add a tournament type
            </button>
          </label>
          <label className="field">
            <span>Competition type</span>
            <select value={form.competitionType} onChange={(e) => update('competitionType', e.target.value)}>
              {options?.competitionTypes.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.en}
                </option>
              ))}
            </select>
            {/* Rule 3 — likewise. */}
            <button type="button" className="link-btn" onClick={() => setAddingType('competition_type')}>
              Add a competition type
            </button>
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Location (Arabic)</span>
            <input type="text" dir="rtl" value={form.locationAr} onChange={(e) => update('locationAr', e.target.value)} />
          </label>
          <label className="field">
            <span>Location (English)</span>
            <input type="text" value={form.locationEn} onChange={(e) => update('locationEn', e.target.value)} />
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>First day</span>
            <input type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} required />
          </label>
          <label className="field">
            <span>Last day</span>
            <input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} required />
          </label>
          <label className="field">
            <span>First bout starts</span>
            <input type="time" value={form.firstBoutTime} onChange={(e) => update('firstBoutTime', e.target.value)} />
          </label>
          <label className="field">
            <span>Entries close</span>
            <input
              type="date"
              value={form.registrationClosesAt}
              onChange={(e) => update('registrationClosesAt', e.target.value)}
            />
            <span className="field__hint">
              Leave empty for the default — {options?.defaultRegistrationCloseDays} days before the tournament.
              It can be extended later.
            </span>
          </label>
        </div>

        <h3 className="form-section-title">Who competes</h3>
        <p className="form-card__intro">
          Every category and gender you choose becomes a set of divisions, one per official weight class.
        </p>

        <div className="field">
          <span>Gender</span>
          <div className="choice-list choice-list--inline">
            {['male', 'female'].map((gender) => (
              <label key={gender} className={`choice${form.genders.includes(gender) ? ' is-checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={form.genders.includes(gender)}
                  onChange={() => toggle('genders', gender)}
                />
                <span className="choice__body">
                  <span className="choice__title">{gender === 'male' ? 'Men' : 'Women'}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {Object.entries(categoriesByTrack).map(([track, list]) => (
          <div className="field" key={track}>
            <span>
              {track === 'development' ? 'Development' : track === 'elite' ? 'Elite' : 'Masters'} categories
            </span>
            <div className="choice-list choice-list--inline">
              {list.map((category) => (
                <label
                  key={category.value}
                  className={`choice${form.categories.includes(category.value) ? ' is-checked' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={form.categories.includes(category.value)}
                    onChange={() => toggle('categories', category.value)}
                  />
                  <span className="choice__body">
                    <span className="choice__title">{category.en}</span>
                    <span className="choice__meta">
                      ages {category.minAge}–{category.maxAge}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {Object.keys(available).length > 0 && (
          <>
            <h3 className="form-section-title">Weight classes</h3>
            <p className="form-card__intro">
              Tick the classes this tournament runs. Leave a row untouched to run all of them.
            </p>

            {Object.entries(available).map(([key, classes]) => {
              const [category, gender] = key.split(':')
              const label = options?.categories.find((entry) => entry.value === category)?.en || category
              const chosen = form.weightClasses[key] || []

              return (
                <div className="weights" key={key}>
                  <span className="weights__pair">
                    {gender === 'female' ? 'Women' : 'Men'} — {label}
                    <em>
                      {chosen.length > 0 ? `${chosen.length} chosen` : `all ${classes.length}`}
                    </em>
                  </span>
                  <div className="weights__list">
                    {classes.map((entry) => {
                      const on = chosen.some((value) => value === entry.limitKg)
                      return (
                        <button
                          key={String(entry.limitKg)}
                          type="button"
                          className={`weights__chip${on ? ' is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => toggleWeight(key, entry.limitKg)}
                        >
                          {entry.labelEn}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {divisionCount > 0 && (
          <p className="form-card__intro">
            That makes <strong>{divisionCount}</strong> divisions — category × gender × weight class.
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/tournaments')}>
            Back
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create tournament' : 'Save changes'}
          </button>
        </div>
      </form>

      {addingType && (
        <AddOptionDialog
          kind={addingType}
          onClose={() => setAddingType(null)}
          onSave={(nameAr, nameEn) => addOption(addingType, nameAr, nameEn)}
        />
      )}

      {!isNew && divisions.length > 0 && (
        <section className="form-card">
          <h3 className="form-section-title form-section-title--first">Divisions</h3>
          <p className="form-card__intro">
            {divisions.length} divisions. Each one is drawn and scheduled on its own.
          </p>
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
                {divisions.map((division) => (
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

/** REQ-01 rules 2 and 3 — adding to one of the two lists. */
function AddOptionDialog({ kind, onClose, onSave }) {
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')

  return (
    <section className="form-card">
      <h3 className="form-section-title form-section-title--first">
        {kind === 'tournament_type' ? 'New tournament type' : 'New competition type'}
      </h3>
      <p className="form-card__intro">
        It joins the list for every tournament from now on, and the system's existing rules apply to it
        unchanged.
      </p>

      <div className="form-grid">
        <label className="field">
          <span>Name (Arabic)</span>
          <input type="text" dir="rtl" value={nameAr} onChange={(event) => setNameAr(event.target.value)} />
        </label>
        <label className="field">
          <span>Name (English)</span>
          <input type="text" value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!nameAr.trim() || !nameEn.trim()}
          onClick={() => onSave(nameAr.trim(), nameEn.trim())}
        >
          Add
        </button>
      </div>
    </section>
  )
}
