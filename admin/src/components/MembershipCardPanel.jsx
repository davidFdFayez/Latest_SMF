import { useEffect, useState } from 'react'
import { registrationsApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'

/**
 * The member's card link, as the console sees it — tracker ISSUE-03.
 *
 * A reviewer needs three things from a card: the address to send the member,
 * the code to print, and a way to take it back if it ends up somewhere it
 * should not. Regenerating is that last one — there is no other way to revoke
 * a link that has been forwarded, and it is deliberately a little blunt.
 */
export default function MembershipCardPanel({ registrationId }) {
  const [state, setState] = useState({ loading: true, data: null })
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, data: null })
    registrationsApi
      .card(registrationId)
      .then((data) => !cancelled && setState({ loading: false, data }))
      .catch((err) => {
        if (cancelled) return
        setError(extractErrorMessage(err, 'Could not load the card link.'))
        setState({ loading: false, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [registrationId])

  async function copy() {
    try {
      await navigator.clipboard.writeText(state.data.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard access can be blocked; the link is on screen regardless.
    }
  }

  async function regenerate() {
    setWorking(true)
    setError('')
    try {
      setState({ loading: false, data: await registrationsApi.regenerateCard(registrationId) })
      setConfirming(false)
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not issue a new link.'))
    } finally {
      setWorking(false)
    }
  }

  if (state.loading) return <p className="form-card__intro">Loading the card…</p>

  if (!state.data?.available) {
    return (
      <p className="form-card__intro">
        {state.data?.reason || error || 'A card exists once the membership has been approved.'}
      </p>
    )
  }

  const { url, qrUrl, card } = state.data

  return (
    <div className="mcard-admin">
      <div className="mcard-admin__qr">
        <img src={qrUrl} alt="QR code for this membership card" />
      </div>

      <div className="mcard-admin__detail">
        <p className="form-card__intro">
          The member can open this to show their membership; an official can scan the code to check
          it. It carries the name, photo, category and validity — and deliberately no ID number,
          phone, email or date of birth.
        </p>

        <label className="field">
          <span>Card link</span>
          <input type="text" value={url} readOnly onFocus={(event) => event.target.select()} />
        </label>

        <div className="mcard-admin__actions">
          <a className="btn btn--small" href={url} target="_blank" rel="noreferrer">
            Open
          </a>
          <button type="button" className="btn btn--small" onClick={copy}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a className="btn btn--small" href={qrUrl} target="_blank" rel="noreferrer">
            Download QR
          </a>

          {!confirming ? (
            <button type="button" className="btn btn--small btn--danger-ghost" onClick={() => setConfirming(true)}>
              Issue a new link
            </button>
          ) : (
            <span className="mcard-admin__confirm">
              This stops the current link working for everyone who has it.
              <button type="button" className="btn btn--small btn--danger" disabled={working} onClick={regenerate}>
                {working ? 'Issuing…' : 'Issue new link'}
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>

        <p className="mcard-admin__state">
          The card currently reads <strong>{card.statusEn}</strong>
          {card.validUntil ? ` · valid until ${new Date(card.validUntil).toLocaleDateString('en-GB')}` : ''}.
        </p>

        {error && <p className="mcard-admin__error">{error}</p>}
      </div>
    </div>
  )
}
