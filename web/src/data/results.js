import raw from './results.json';

function normalize(r) {
  return {
    id: r.id,
    year: r.Year ?? r.year,
    athlete: r.Athlete ?? r.athlete,
    athleteSlug: r.AthleteSlug ?? r.athleteSlug,
    event: (r.Event ?? r.event ?? '').replace(/&amp;/g, '&'),
    location: r.Location ?? r.location,
    category: r.Category ?? r.category,
    medal: (r.Medal ?? r.medal ?? '').toLowerCase(),
    // Arabic names from the federation's national-team participations record.
    // Empty where that record has no counterpart, so callers fall back to the
    // English name rather than showing a blank cell.
    athleteAr: r.AthleteAr ?? r.athleteAr ?? '',
    eventAr: r.EventAr ?? r.eventAr ?? '',
  };
}

const results = (Array.isArray(raw) ? raw : []).map(normalize);

export default results;
export { results };
