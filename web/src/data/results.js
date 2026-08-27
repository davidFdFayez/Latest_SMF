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
  };
}

const results = (Array.isArray(raw) ? raw : []).map(normalize);

export default results;
export { results };
