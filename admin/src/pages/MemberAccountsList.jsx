import { useCallback, useEffect, useState } from 'react'
import { memberAccountsApi } from '../api/resources'
import { extractErrorMessage, formatDate } from '../api/utils'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'

/**
 * Club, coach and athlete accounts — Phase 3 REQ-05, REQ-06, REQ-07.
 *
 * The federation creates the first club accounts, because a club cannot invite
 * itself; after that a club invites its own people. This screen also holds the
 * queue of changes account holders have proposed, which do not take effect
 * until somebody here accepts them.
 */
export default function MemberAccountsList() {
  const [accounts, setAccounts] = useState([])
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [kind, setKind] = useState('')
  const [search, setSearch] = useState('')
  const [working, setWorking] = useState(false)
  // An activation link to hand over, for when the message did not get there.
  const [link, setLink] = useState(null)

  const load = useCallback(async () => {
    const [list, pending] = await Promise.all([
      memberAccountsApi.list({ kind: kind || undefined, search: search.trim() || undefined }),
      memberAccountsApi.changes(),
    ])
    setAccounts(list)
    setChanges(pending)
  }, [kind, search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      load()
        .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Could not load accounts.')))
        .finally(() => !cancelled && setLoading(false))
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [load])

  async function act(action, message) {
    setError('')
    setNotice('')
    setWorking(true)
    try {
      const result = await action()
      await load()

      // An invitation nobody received leaves the account unusable, so the API
      // hands the link back instead of saying it was sent.
      if (result?.activationLink) {
        setLink({ email: result.email, url: result.activationLink })
      } else if (message) {
        setNotice(message)
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'That did not work.'))
    } finally {
      setWorking(false)
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice('Link copied.')
    } catch {
      setError('Could not reach the clipboard — select the link and copy it by hand.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Member accounts"
        description="Clubs, coaches and athletes who sign in to the portal — and the changes they have asked for."
      />

      <Alert type="error" onDismiss={() => setError('')}>
        {error}
      </Alert>
      <Alert type="success" onDismiss={() => setNotice('')}>
        {notice}
      </Alert>

      {/* The link is the account: it is shown once, to be passed on by hand. */}
      {link && (
        <section className="form-card invite-link">
          <h3 className="form-section-title form-section-title--first">
            Activation link for {link.email}
          </h3>
          <p className="form-card__intro">
            No mail server is set up, so nothing was sent. Pass this link to the account holder yourself.
            It is good for 14 days, it works once, and nobody can read it back afterwards — if it goes
            astray, issue a new one, which retires this one.
          </p>

          <div className="invite-link__row">
            <input type="text" readOnly value={link.url} onFocus={(event) => event.target.select()} />
            <button type="button" className="btn btn--small" onClick={() => copy(link.url)}>
              Copy
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => setLink(null)}>
              Done
            </button>
          </div>
        </section>
      )}

      {/* Changes first: they are the thing somebody is waiting on. */}
      {changes.length > 0 && (
        <section className="form-card">
          <h3 className="form-section-title form-section-title--first">
            Changes waiting for approval ({changes.length})
          </h3>
          <p className="form-card__intro">
            An account holder edited their own details. Nothing has changed on the record until you accept it.
          </p>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Who</th>
                  <th>What they changed</th>
                  <th>Asked</th>
                  <th className="data-table__actions-col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => (
                  <tr key={change.id}>
                    <td>
                      <div className="data-table__primary">{change.account?.email}</div>
                      <div className="data-table__subtext">{change.account?.kind}</div>
                    </td>
                    <td>
                      <dl className="change-list">
                        {Object.entries(change.changes).map(([field, value]) => (
                          <div key={field}>
                            <dt>{field}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                    <td>{formatDate(change.createdAt)}</td>
                    <td className="data-table__actions">
                      <button
                        type="button"
                        className="btn btn--small btn--primary"
                        disabled={working}
                        onClick={() =>
                          act(() => memberAccountsApi.reviewChange(change.id, true, null), 'Change applied.')
                        }
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn--small btn--danger-ghost"
                        disabled={working}
                        onClick={() =>
                          act(() => memberAccountsApi.reviewChange(change.id, false, null), 'Change refused.')
                        }
                      >
                        Refuse
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="toolbar">
        <input
          type="search"
          className="toolbar__search"
          placeholder="Search by email, name or membership number…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search accounts"
        />
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className="toolbar__select"
          aria-label="Filter by kind"
        >
          <option value="">All kinds</option>
          <option value="club">Clubs</option>
          <option value="coach">Coaches</option>
          <option value="athlete">Athletes</option>
        </select>
      </div>

      {loading ? (
        <Spinner label="Loading accounts…" />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Invite a club from its beneficiary profile; the club then invites its own coaches and athletes."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Kind</th>
                <th>Membership</th>
                <th>State</th>
                <th>Last seen</th>
                <th className="data-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <div className="data-table__primary">{account.email}</div>
                    {account.displayName && (
                      <div className="data-table__subtext">{account.displayName}</div>
                    )}
                  </td>
                  <td>{account.kindEn}</td>
                  <td>
                    {account.membershipNumber || <span className="data-table__subtext">—</span>}
                    <div className="data-table__subtext">{account.membershipStatus}</div>
                  </td>
                  <td>
                    {!account.isActive ? (
                      <Badge tone="red">Deactivated</Badge>
                    ) : account.isPending ? (
                      <Badge tone="gold">Invitation pending</Badge>
                    ) : (
                      <Badge tone="green">Active</Badge>
                    )}
                    {account.isPending && account.inviteSentAt && (
                      <div className="data-table__subtext">sent {formatDate(account.inviteSentAt)}</div>
                    )}
                  </td>
                  <td>
                    {account.lastLoginAt ? formatDate(account.lastLoginAt) : (
                      <span className="data-table__subtext">never</span>
                    )}
                  </td>
                  <td className="data-table__actions">
                    {account.isPending && (
                      <>
                        <button
                          type="button"
                          className="btn btn--small"
                          disabled={working}
                          onClick={() =>
                            act(() => memberAccountsApi.resend(account.id), 'Invitation sent again.')
                          }
                        >
                          Resend
                        </button>
                        {/* For the holder who says the message never arrived. */}
                        <button
                          type="button"
                          className="btn btn--small btn--ghost"
                          disabled={working}
                          onClick={() => act(() => memberAccountsApi.inviteLink(account.id))}
                        >
                          Get link
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={`btn btn--small${account.isActive ? ' btn--danger-ghost' : ''}`}
                      disabled={working}
                      onClick={() =>
                        act(
                          () => memberAccountsApi.setActive(account.id, !account.isActive),
                          account.isActive ? 'Account deactivated.' : 'Account reactivated.',
                        )
                      }
                    >
                      {account.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
