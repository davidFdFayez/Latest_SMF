import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { membersApi, registrationsApi } from '../api/resources'
import { extractErrorMessage, formatDate } from '../api/utils'
import PageHeader from '../components/PageHeader'
import MembershipCardPanel from '../components/MembershipCardPanel'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'

/**
 * One beneficiary's digital profile — tracker ISSUE-03.
 *
 * The record of a person or a club, rather than of a form: who they are, the
 * membership they hold, the documents on file, and every application they have
 * made. The applications remain the source of truth and each one links back to
 * its review page; this is the address a reviewer can reach the *beneficiary*
 * at, which is what was missing.
 */

const TYPE_LABELS = {
  athlete: 'Athlete',
  coach: 'Coach',
  official: 'Referee',
  club: 'Club / facility',
}

const GRADE_LABELS = {
  entry: 'Entry level',
  third: 'Third grade',
  second: 'Second grade',
  first: 'First grade',
  international: 'International',
}

const ENTITY_LABELS = { club: 'Club', center: 'Centre', academy: 'Academy' }

const DOCUMENT_LABELS = {
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

function readableSlot(slot) {
  if (DOCUMENT_LABELS[slot]) return DOCUMENT_LABELS[slot]
  const spaced = slot.replace(/([A-Z])/g, ' $1').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function Row({ label, children }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="detail-grid__item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function MemberProfile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    membersApi
      .get(id)
      .then((data) => !cancelled && setProfile(data))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load this profile.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  async function openDocument(document) {
    setError('')
    try {
      await registrationsApi.openAttachment(profile.membership.id, document.id, document.fileName)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not open that document.'))
    }
  }

  if (loading) return <Spinner label="Loading profile…" />

  if (!profile) {
    return (
      <div>
        <PageHeader title="Beneficiary profile" />
        <Alert type="error">{error || 'This profile could not be found.'}</Alert>
      </div>
    )
  }

  const membership = profile.membership || {}
  const expired = Boolean(membership.isExpired)
  const live = membership.status === 'approved' && !expired

  return (
    <div>
      <PageHeader
        title={profile.nameEn || profile.nameAr || 'Beneficiary'}
        description={`${TYPE_LABELS[profile.type] || profile.type}${
          profile.nameAr && profile.nameEn ? ` · ${profile.nameAr}` : ''
        }`}
        actions={
          <Link to="/members" className="btn btn--ghost">
            Back to directory
          </Link>
        }
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>

      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Membership</h3>
        <div className="chip-list" style={{ marginBottom: '1rem' }}>
          <Badge tone={live ? 'green' : expired ? 'red' : 'neutral'}>
            {expired ? 'Expired' : membership.statusLabelEn || membership.status}
          </Badge>
          {membership.membershipNumber && <Badge tone="gold">{membership.membershipNumber}</Badge>}
          {profile.competitionCategory && <Badge tone="green">{profile.competitionCategory.en}</Badge>}
        </div>

        <dl className="detail-grid">
          <Row label="Licence">
            {profile.track ? `${profile.track.licenceNameEn} · ${profile.track.termYears}-year term` : null}
          </Row>
          <Row label="Approved">{formatDate(membership.approvedAt) || '—'}</Row>
          <Row label="Term ends">
            {membership.expiresAt ? (
              <>
                {formatDate(membership.expiresAt)}
                {/* BUG-12 — an expired term says so and counts nothing down. */}
                {expired ? (
                  <span className="review-term--expired"> · Expired · 0 days left</span>
                ) : typeof membership.daysUntilExpiry === 'number' ? (
                  ` · ${membership.daysUntilExpiry} days left`
                ) : null}
              </>
            ) : (
              '—'
            )}
          </Row>
          <Row label="Renewals">
            {membership.renewalCount > 0 ? `${membership.renewalCount} · last ${formatDate(membership.renewedAt)}` : 'None'}
          </Row>
          <Row label="Current application">
            <Link to={`/registrations/${membership.id}`}>{membership.referenceNumber}</Link>
          </Row>
        </dl>
      </section>

      {/* ISSUE-03 — the part of the profile the beneficiary themselves can hold. */}
      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Membership card</h3>
        <MembershipCardPanel registrationId={membership.id} />
      </section>

      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Identity &amp; contact</h3>
        <dl className="detail-grid">
          <Row label="Name (Arabic)">{profile.nameAr ? <bdi>{profile.nameAr}</bdi> : null}</Row>
          <Row label="Name (English)">{profile.nameEn}</Row>
          <Row label={profile.type === 'club' ? 'Official email' : 'Email'}>{profile.email}</Row>
          <Row label="Mobile">{profile.phone}</Row>
          <Row label="ID on file">{profile.identity ? <code>{profile.identity}</code> : null}</Row>
          <Row label="Date of birth">{formatDate(profile.dateOfBirth)}</Row>
          <Row label="Gender">{profile.gender}</Row>
          <Row label="Nationality">{profile.nationality}</Row>
          <Row label="Location">{[profile.region, profile.city].filter(Boolean).join(' · ')}</Row>
          <Row label="Competition category">
            {profile.competitionCategory
              ? `${profile.competitionCategory.en}${profile.competitionTrack ? ` · ${profile.competitionTrack} track` : ''}`
              : null}
          </Row>
          <Row label="Referee grade">{GRADE_LABELS[profile.refereeGrade] || profile.refereeGrade}</Row>
          <Row label="Entity type">{ENTITY_LABELS[profile.entityType] || profile.entityType}</Row>
          <Row label="Club">{profile.clubName}</Row>
        </dl>
      </section>

      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Documents on file</h3>
        {profile.documents.length === 0 ? (
          <p className="form-card__intro">
            No documents are attached. They can be added from the{' '}
            <Link to={`/registrations/${membership.id}`}>application</Link>.
          </p>
        ) : (
          <ul className="doc-list">
            {profile.documents.map((document) => (
              <li className="doc-list__item" key={document.id}>
                <div className="doc-list__text">
                  <span className="doc-list__slot">{readableSlot(document.slot)}</span>
                  <span className="doc-list__file">{document.fileName}</span>
                </div>
                <div className="doc-list__actions">
                  <button type="button" className="btn btn--small" onClick={() => openDocument(document)}>
                    Open
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="form-card">
        <h3 className="form-section-title form-section-title--first">Application history</h3>
        <p className="form-card__intro">
          Every application this beneficiary has made. The profile is assembled from them, so it is never out of step
          with the record.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Approved</th>
                <th>Term ends</th>
              </tr>
            </thead>
            <tbody>
              {profile.applications.map((application) => (
                <tr key={application.id}>
                  <td>
                    <Link to={`/registrations/${application.id}`}>{application.referenceNumber}</Link>
                    {application.isCurrent && (
                      <div className="data-table__subtext">Current record</div>
                    )}
                  </td>
                  <td>{formatDate(application.createdAt)}</td>
                  <td>{application.statusLabelEn}</td>
                  <td>{formatDate(application.approvedAt) || '—'}</td>
                  <td>{formatDate(application.expiresAt) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
