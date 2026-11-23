/**
 * ISOLATED TEST ENVIRONMENT ONLY — NEVER DEPLOY THIS FILE.
 *
 * Reads a DRAFT draw for the Draw tab's preview mode. Only loaded by a build made with
 * VITE_SMTF_DRAW_PREVIEW=1 (the isolated start script), and only when the page carries
 * ?preview=draft. The isolated dev server adds the administrator token to this route (see the
 * isolated vite.config.js); the API endpoint exists only when IsolatedTest__PublicDrawPreview=true
 * and still requires the Draw permission. Returns null when there is nothing to preview.
 */
import client from '../../api/client';

export async function fetchDraftPreview(tournamentId, divisionId) {
  try {
    const { data } = await client.get(`/api/isolated-preview/tournament-${tournamentId}/divisions/${divisionId}/draw`);
    return data;
  } catch {
    return null;
  }
}

/** Where the preview's athlete photos come from (same slot addressing as the public photo route). */
export const previewPhotoBase = (tournamentId, divisionId) =>
  `/api/isolated-preview/tournament-${tournamentId}/divisions/${divisionId}/draw/photo`;
