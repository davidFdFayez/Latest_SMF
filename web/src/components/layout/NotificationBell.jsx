import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchNotifications, markAllNotificationsRead, markNotificationRead, subscribeNotices,
} from '../../api/member';
import { toLatinDigits } from '../../utils/format';
import { IconBell, IconCoach, IconInfo, IconMail, IconTrophy } from '../icons/AccountIcons';

/**
 * The signed-in member's notification bell, beside their account icon. It is
 * the alert and the way there: a notice opens the page where the matter is
 * dealt with (an invitation is answered in Requests & Invitations, not here).
 * Shared by every kind of member account.
 */

const TYPE_ICON = {
  'club_invitation.received': IconMail,
  'club_invitation.accepted': IconCoach,
  'tournament_entry.created': IconTrophy,
};

/** How often the bell looks again while a page stays open. */
const REFRESH_MS = 60_000;

function whenText(value, lang) {
  // Stored in UTC; a time sent without its zone is read as UTC, not local.
  const text = String(value);
  const utc = /(Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`;
  const seconds = (new Date(utc).getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month']];
  let amount = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(amount) < size) return toLatinDigits(format.format(Math.round(amount), unit));
    amount /= size;
  }
  return toLatinDigits(format.format(Math.round(amount), 'year'));
}

export default function NotificationBell({ lang }) {
  const ar = lang === 'ar';
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  const load = useCallback(() => {
    fetchNotifications().then(setData).catch(() => {});
  }, []);

  // On arrival, on every page, now and then, and whenever an answer was given.
  useEffect(() => { load(); }, [load, location.pathname, location.search]);
  useEffect(() => {
    const timer = window.setInterval(load, REFRESH_MS);
    const unsubscribe = subscribeNotices(load);
    return () => { window.clearInterval(timer); unsubscribe(); };
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (wrap.current && !wrap.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function openNotice(notice) {
    setOpen(false);
    if (!notice.read) {
      await markNotificationRead(notice.id).catch(() => {});
      load();
    }
    if (notice.target) navigate(notice.target);
  }

  async function readAll() {
    await markAllNotificationsRead().catch(() => {});
    load();
  }

  const label = ar ? 'الإشعارات' : 'Notifications';
  const badge = data.unread > 9 ? '9+' : String(data.unread);

  return (
    <div className="notice-bell" ref={wrap}>
      <button
        type="button"
        className="header-account notice-bell__button"
        aria-label={data.unread ? `${label} (${data.unread})` : label}
        title={label}
        aria-expanded={open}
        onClick={(event) => {
          // Where the bell ends on screen: a phone's panel opens just below it.
          const bottom = event.currentTarget.getBoundingClientRect().bottom;
          wrap.current?.style.setProperty('--notice-top', `${Math.round(bottom + 10)}px`);
          setOpen((current) => !current);
        }}
      >
        <IconBell className="header-account__icon" />
        {data.unread > 0 && <span className="notice-bell__badge">{toLatinDigits(badge)}</span>}
      </button>

      {open && (
        <div className="notice-panel" dir={ar ? 'rtl' : 'ltr'} role="dialog" aria-label={label}>
          <div className="notice-panel__head">
            <strong>{label}</strong>
            {data.unread > 0 && (
              <button type="button" className="notice-panel__all" onClick={readAll}>
                {ar ? 'تحديد الكل كمقروء' : 'Mark all as read'}
              </button>
            )}
          </div>

          {data.items.length === 0 ? (
            <p className="notice-panel__empty">
              <span className="notice-panel__empty-icon"><IconBell /></span>
              {ar ? 'لا توجد إشعارات حالياً' : 'No notifications right now'}
            </p>
          ) : (
            <ul className="notice-panel__list">
              {data.items.map((notice) => {
                const Icon = TYPE_ICON[notice.type] || IconInfo;
                return (
                  <li key={notice.id}>
                    <button
                      type="button"
                      className={`notice-item${notice.read ? '' : ' is-unread'}`}
                      onClick={() => openNotice(notice)}
                    >
                      <span className="notice-item__icon"><Icon /></span>
                      <span className="notice-item__body">
                        <strong>{ar ? notice.titleAr : notice.titleEn}</strong>
                        <span>{ar ? notice.bodyAr : notice.bodyEn}</span>
                        <time dateTime={notice.createdAt}>{whenText(notice.createdAt, lang)}</time>
                      </span>
                      {!notice.read && <span className="notice-item__dot" aria-label={ar ? 'غير مقروء' : 'Unread'} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
