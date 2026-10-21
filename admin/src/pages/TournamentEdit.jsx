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
  const [weightPreview, setWeightPreview] = useState({})
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

  /* How many divisions the current choices produce (REQ-02 rule 5). */
  useEffect(() => {
    if (!options || form.categories.length === 0 || form.genders.length === 0) {
      setWeightPreview({})
      return
    }

    let cancelled = false
    const pairs = form.categories.flatMap((category) => form.genders.map((gender) => [category, gender]))

    Promise.all(pairs.map(([category, gender]) => tournamentsApi.weightClasses(category, gender)))
      .then((lists) => {
        if (cancelled) return
        const counts = {}
        pairs.forEach(([category, gender], index) => {
          counts[`${category}:${gender}`] = lists[index].length
        })
        setWeightPreview(counts)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [options, form.categories, form.genders])

  const divisionCount = useMemo(
    () => Object.values(weightPreview).reduce((total, count) => total + count, 0),
    [weightPreview],
  )

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
