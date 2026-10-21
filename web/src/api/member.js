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

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do; the caller keeps the token in memory for this page.
  }
}

export function signOut() {
  setToken('');
}

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

export async function fetchRoster() {
  const { data } = await client.get('/api/member/roster', auth());
  return data;
}

export async function invite(body) {
  const { data } = await client.post('/api/member/roster/invite', body, auth());
  return data;
}

/* ── tournaments ────────────────────────────────────────────────────────── */

export async function fetchTournaments() {
  const { data } = await client.get('/api/member/tournaments', auth());
  return Array.isArray(data) ? data : [];
}

export async function fetchEligible(tournamentId) {
  const { data } = await client.get(`/api/member/tournaments/${tournamentId}/eligible`, auth());
  return Array.isArray(data) ? data : [];
}

export async function enter(tournamentId, body) {
  const { data } = await client.post(`/api/member/tournaments/${tournamentId}/entries`, body, auth());
  return data;
}

export async function fetchAthlete(registrationId) {
  const { data } = await client.get(`/api/member/athletes/${registrationId}`, auth());
  return data;
}
