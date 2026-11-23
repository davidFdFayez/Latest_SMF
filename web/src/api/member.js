import client from './client';

/**
 * The club, coach and athlete portal — Phase 3 REQ-05, REQ-06, REQ-07.
 *
 * A member's token is kept apart from everything else the site stores, and is
 * sent only on these calls: the public pages have no business carrying it, and
 * the console's API will not accept it anyway.
 */

const TOKEN_KEY = 'smf_member_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    // A private window with storage blocked: the portal still works for the
    // length of one page, which is better than refusing to load.
    return '';
  }
}

const TOKEN_EVENT = 'smf-member-token';

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do; the caller keeps the token in memory for this page.
  }
  // Signing in or out changes what the header offers, without a reload.
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

/** Calls back whenever a member signs in or out, here or in another tab. */
export function subscribeToken(callback) {
  window.addEventListener(TOKEN_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(TOKEN_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/**
 * Where to go after signing in: a page on this site that sent the visitor
 * here (a tournament's details, say), or the account itself. Anything that
 * is not a plain path on this site is ignored, so the parameter cannot send
 * anyone elsewhere.
 */
export function safeReturnPath(value) {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/account';
}

/**
 * The kind of account the stored token is for (club, coach, athlete,
 * official), read from the token itself so the header can point at the right
 * page without a request. Presentation only — the API decides access.
 */
export function tokenKind(token = getToken()) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part)).member_kind || '';
  } catch {
    return '';
  }
}

export function signOut() {
  setToken('');
}

/*
 * A signed-in member's session lasts a few hours. A page left open longer
 * still looks signed in, and its next call is refused with 401: the session
 * has ended, not the call. The stored token is dropped, which signs the
 * header out and sends an account page to sign-in (see AccountShell), rather
 * than each section reporting that it could not load.
 *
 * Only member calls that carried the member's current token count: a wrong
 * password on the sign-in form carries none, and a token replaced by a newer
 * sign-in meanwhile is not the one to drop.
 */
client.interceptors.response.use(undefined, (error) => {
  const sent = error?.config?.headers?.Authorization;
  if (error?.response?.status === 401
      && String(error.config?.url || '').startsWith('/api/member/')
      && sent && sent === `Bearer ${getToken()}`) {
    setToken('');
  }
  return Promise.reject(error);
});

function auth() {
  const token = getToken();
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
}

/** Bilingual message out of whatever the API answered with. */
export function messageOf(error, lang, fallback) {
  const data = error?.response?.data;
  if (data) {
    const text = lang === 'ar' ? data.messageAr : data.messageEn;
    if (text) return text;
    if (data.message) return data.message;
  }
  return fallback;
}

/* ── signing in ─────────────────────────────────────────────────────────── */

export async function login(email, password) {
  const { data } = await client.post('/api/member/login', { email, password });
  setToken(data.token);
  return data;
}

export async function checkInvite(token) {
  const { data } = await client.get(`/api/member/activate/${encodeURIComponent(token)}`);
  return data;
}

export async function activate(token, password) {
  const { data } = await client.post('/api/member/activate', { token, password });
  setToken(data.token);
  return data;
}

export async function changePassword(currentPassword, newPassword) {
  const { data } = await client.post(
    '/api/member/me/password',
    { currentPassword, newPassword },
    auth(),
  );
  return data;
}

/* ── the account ────────────────────────────────────────────────────────── */

export async function fetchMe() {
  const { data } = await client.get('/api/member/me', auth());
  return data;
}

export async function proposeChange(changes) {
  const { data } = await client.post('/api/member/me/changes', { changes }, auth());
  return data;
}

export async function fetchMedical() {
  const { data } = await client.get('/api/member/me/medical', auth());
  return data;
}

export async function saveMedical(body) {
  const { data } = await client.put('/api/member/me/medical', body, auth());
  return data;
}

/* ── the roster, for a club or a coach ──────────────────────────────────── */

/** The member's approved registration answers, and any change awaiting review. */
export async function fetchProfile() {
  const { data } = await client.get('/api/member/me/profile', auth());
  return data;
}

/** A club withdraws an invitation nobody has taken up yet. */
export async function cancelInvitation(accountId) {
  const { data } = await client.delete(`/api/member/roster/${accountId}/invitation`, auth());
  return data;
}

/** The club lets a player or coach go: only their link to the club ends. */
export async function removeFromClub(accountId) {
  const { data } = await client.post(`/api/member/roster/${accountId}/remove`, {}, auth());
  return data;
}

/** The signed-in athlete's own competition record — athletes only. */
export async function fetchAthleteRecord() {
  const { data } = await client.get('/api/member/athlete/record', auth());
  return data;
}

/** The club account's statistics — clubs only. */
export async function fetchClubStatistics() {
  const { data } = await client.get('/api/member/club/statistics', auth());
  return data;
}

export async function fetchRoster() {
  const { data } = await client.get('/api/member/roster', auth());
  return data;
}

export async function invite(body) {
  const { data } = await client.post('/api/member/roster/invite', body, auth());
  return data;
}

/* ── tournaments ────────────────────────────────────────────────────────── */

/**
 * Published tournaments, with this account's athletes in each. With
 * { open: true }, only those taking entries now — the server decides.
 */
export async function fetchTournaments({ open } = {}) {
  const { data } = await client.get('/api/member/tournaments', { ...auth(), params: open ? { open: true } : {} });
  return Array.isArray(data) ? data : [];
}

/* ── club invitations and the notification bell ───────────────────────── */

const NOTICES_EVENT = 'smf-member-notices';

/** Asks the bell to look again — after an answer that will have produced notices. */
export function refreshNotices() {
  window.dispatchEvent(new Event(NOTICES_EVENT));
}

export function subscribeNotices(callback) {
  window.addEventListener(NOTICES_EVENT, callback);
  return () => window.removeEventListener(NOTICES_EVENT, callback);
}

/** The club invitations a club has sent, or a coach has received. */
export async function fetchInvitations() {
  const { data } = await client.get('/api/member/invitations', auth());
  return Array.isArray(data) ? data : [];
}

/** A coach answers an invitation: 'accept' or 'reject'. */
export async function answerInvitation(id, answer) {
  const { data } = await client.post(`/api/member/invitations/${id}/${answer}`, {}, auth());
  return data;
}

/** A club withdraws a coach invitation nobody has answered. */
export async function cancelClubInvitation(id) {
  const { data } = await client.post(`/api/member/invitations/${id}/cancel`, {}, auth());
  return data;
}

export async function fetchNotifications() {
  const { data } = await client.get('/api/member/notifications', auth());
  return data;
}

export async function markNotificationRead(id) {
  const { data } = await client.post(`/api/member/notifications/${id}/read`, {}, auth());
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await client.post('/api/member/notifications/read-all', {}, auth());
  return data;
}

/** REQ-02 — where the signed-in athlete stands against one tournament. Athletes only. */
export async function fetchEligibility(tournamentId) {
  const { data } = await client.get(`/api/member/tournaments/${tournamentId}/eligibility`, auth());
  return data;
}

export async function fetchEligible(tournamentId) {
  const { data } = await client.get(`/api/member/tournaments/${tournamentId}/eligible`, auth());
  return Array.isArray(data) ? data : [];
}

export async function enter(tournamentId, body) {
  const { data } = await client.post(`/api/member/tournaments/${tournamentId}/entries`, body, auth());
  return data;
}

/**
 * REQ-03 — what registering an athlete in a tournament starts from: their
 * eligibility, the details pre-filled from their record and, when the athlete
 * registers themselves, their medical section. A club or coach names the
 * athlete; an athlete is always themselves.
 */
export async function fetchRegistrationForm(tournamentId, athleteRegistrationId) {
  const query = athleteRegistrationId ? `?athleteRegistrationId=${athleteRegistrationId}` : '';
  const { data } = await client.get(`/api/member/tournaments/${tournamentId}/registration${query}`, auth());
  return data;
}

/* ── the athlete's Medical File (REQ-04) ────────────────────────────────── */

/** What each tournament the athlete is entered in still needs from them. */
export async function fetchMedicalRequirements() {
  const { data } = await client.get('/api/member/me/medical/requirements', auth());
  return data;
}

/** Uploads one medical document; the returned id is what a submission names. */
export async function uploadMedicalAttachment(file) {
  const body = new FormData();
  body.append('file', file);
  const { data } = await client.post('/api/member/me/medical/attachments', body, {
    headers: { ...auth().headers, 'Content-Type': undefined },
    timeout: 60000,
  });
  return data;
}

/**
 * Opens a document of the athlete's own file, or the guardian consent form to
 * print, in a new tab. Both need the member's token, which a plain link
 * cannot carry, so the file is fetched and handed to the tab as a blob.
 */
export async function openMedicalDocument(slot, tournamentId) {
  // The two forms an under-18's guardian signs — for a tournament, whose year
  // decides whether they apply — or a document on file.
  const forms = {
    guardian_form: '/api/member/me/medical/guardian-consent',
    pregnancy_form: '/api/member/me/medical/pregnancy-declaration',
  };
  const path = forms[slot]
    ? `${forms[slot]}${tournamentId ? `?tournamentId=${tournamentId}` : ''}`
    : `/api/member/me/medical/documents/${slot}`;
  const tab = window.open('', '_blank');
  try {
    const { data } = await client.get(path, { ...auth(), responseType: 'blob' });
    const url = URL.createObjectURL(data);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export async function fetchAthlete(registrationId) {
  const { data } = await client.get(`/api/member/athletes/${registrationId}`, auth());
  return data;
}
