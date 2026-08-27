import { useEffect, useMemo, useState } from 'react';
import { useLang } from '../../context/LanguageContext';
import PageHero from '../../components/PageHero';
import { fetchResults, fetchResultsStats } from '../../api/services';
import resultsFallback from '../../data/results';

const MEDAL_LABEL = {
  gold: { ar: 'ذهب', en: 'Gold' },
  silver: { ar: 'فضة', en: 'Silver' },
  bronze: { ar: 'برونز', en: 'Bronze' },
};

export default function ResultsArchive() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const [rows, setRows] = useState(resultsFallback || []);
  const [stats, setStats] = useState({ gold: 7, silver: 17, bronze: 48, total: 72, championships: 12 });
  const [year, setYear] = useState('');
  const [event, setEvent] = useState('');
  const [medal, setMedal] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('table');

  useEffect(() => {
    fetchResults().then((data) => { if (data?.length) setRows(data); });
    fetchResultsStats().then((data) => { if (data) setStats(data); });
  }, []);

  const years = useMemo(() => [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a), [rows]);
  const events = useMemo(() => [...new Set(rows.map((r) => r.event))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (year && String(r.year) !== String(year)) return false;
      if (event && r.event !== event) return false;
      if (medal && r.medal !== medal) return false;
      if (q && !(
        r.athlete?.toLowerCase().includes(q) ||
        r.athleteSlug?.toLowerCase().includes(q) ||
        r.event?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [rows, year, event, medal, search]);

  const timeline = useMemo(() => {
    const byYear = {};
    filtered.forEach((r) => {
      if (!byYear[r.year]) byYear[r.year] = {};
      if (!byYear[r.year][r.event]) byYear[r.year][r.event] = [];
      byYear[r.year][r.event].push(r);
    });
    return Object.keys(byYear).sort((a, b) => Number(b) - Number(a)).map((y) => ({
      year: y,
      events: Object.keys(byYear[y]).map((ev) => ({ event: ev, rows: byYear[y][ev] })),
    }));
  }, [filtered]);

  return (
    <>
      <PageHero
        tag="2019 – 2026"
        title={ar ? 'سجل النتائج الدولية' : 'International Results Archive'}
        subtitle={ar ? 'السجل الرسمي لجميع الميداليات الدولية للمنتخب الوطني' : 'Official record of all national team international medals'}
        breadcrumb={[
          { label: ar ? 'الاتحاد' : 'Organization', to: '/organization/overview' },
          { label: ar ? 'سجل النتائج' : 'Results Archive' },
        ]}
        stats={[
          { value: String(stats.gold), label: ar ? 'ذهب' : 'Gold' },
          { value: String(stats.silver), label: ar ? 'فضة' : 'Silver' },
          { value: String(stats.bronze), label: ar ? 'برونز' : 'Bronze' },
          { value: String(stats.total), label: ar ? 'الإجمالي' : 'Total' },
        ]}
      />

      <section className="section--white">
        <div className="container">
          {/* UX-02 — the search input used to be a differently sized control
              with its own inline styles, so it sat off the baseline the three
              dropdowns and the two view buttons shared. All six now come from
              one class pair with a single height and spacing. */}
          <div id="archiveFilters" data-lang={lang} className="archive-filters">
            <label className="archive-filters__field">
              <span className="s-label">{ar ? 'السنة' : 'Year'}</span>
              <select className="archive-filters__control" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">{ar ? 'الكل' : 'All'}</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>

            <label className="archive-filters__field" style={{ minInlineSize: '14rem' }}>
              <span className="s-label">{ar ? 'البطولة' : 'Event'}</span>
              <select className="archive-filters__control" value={event} onChange={(e) => setEvent(e.target.value)}>
                <option value="">{ar ? 'الكل' : 'All'}</option>
                {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
            </label>

            <label className="archive-filters__field">
              <span className="s-label">{ar ? 'الميدالية' : 'Medal'}</span>
              <select className="archive-filters__control" value={medal} onChange={(e) => setMedal(e.target.value)}>
                <option value="">{ar ? 'الكل' : 'All'}</option>
                <option value="gold">{ar ? 'ذهب' : 'Gold'}</option>
                <option value="silver">{ar ? 'فضة' : 'Silver'}</option>
                <option value="bronze">{ar ? 'برونز' : 'Bronze'}</option>
              </select>
            </label>

            <label className="archive-filters__field archive-filters__field--search">
              <span className="s-label">{ar ? 'بحث' : 'Search'}</span>
              <input
                className="archive-filters__control"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={ar ? 'اسم الرياضي…' : 'Athlete name…'}
              />
            </label>

            <div className="archive-filters__views">
              <button type="button" className={`btn ${view === 'table' ? 'btn--green' : 'btn--outline'}`} onClick={() => setView('table')} aria-pressed={view === 'table'}>
                {ar ? 'جدول' : 'Table'}
              </button>
              <button type="button" className={`btn ${view === 'timeline' ? 'btn--green' : 'btn--outline'}`} onClick={() => setView('timeline')} aria-pressed={view === 'timeline'}>
                {ar ? 'زمني' : 'Timeline'}
              </button>
            </div>
          </div>

          <p className="s-sub" style={{ marginBottom: '1rem' }}>
            {ar ? `عرض ${filtered.length} سجل` : `Showing ${filtered.length} record(s)`}
          </p>

          {view === 'table' ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="archive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>{ar ? 'السنة' : 'Year'}</th>
                    <th>{ar ? 'الرياضي' : 'Athlete'}</th>
                    <th>{ar ? 'البطولة' : 'Event'}</th>
                    <th>{ar ? 'الموقع' : 'Location'}</th>
                    <th>{ar ? 'الفئة' : 'Category'}</th>
                    <th>{ar ? 'الميدالية' : 'Medal'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id || `${r.year}-${r.athlete}-${r.event}-${r.category}-${r.medal}`}>
                      <td className="archive-table__year">{r.year}</td>
                      <td className="archive-table__athlete">{r.athlete}</td>
                      <td className="archive-table__event">{r.event}</td>
                      <td className="archive-table__location">{r.location}</td>
                      <td>{r.category}</td>
                      <td>
                        <span className={`medal-badge medal-badge--${r.medal}`}>
                          {MEDAL_LABEL[r.medal]?.[ar ? 'ar' : 'en'] || r.medal}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <p style={{ textAlign: 'center', padding: '2rem' }}>{ar ? 'لا توجد نتائج' : 'No results'}</p>}
            </div>
          ) : (
            <div>
              {timeline.map((block) => (
                <div key={block.year} className="archive-year-block" style={{ marginBottom: '2rem' }}>
                  <h3 className="s-heading" style={{ fontSize: '1.5rem' }}>{block.year}</h3>
                  {block.events.map((grp) => (
                    <div key={grp.event} className="archive-event-group" style={{ margin: '1rem 0 1.5rem', padding: '1rem', background: 'var(--clr-offwhite)', borderRadius: 8 }}>
                      <h4 style={{ marginBottom: '0.75rem' }}>{grp.event}</h4>
                      {grp.rows.map((r) => (
                        <div key={`${r.athlete}-${r.category}-${r.medal}`} className="archive-result-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0.4rem 0', borderBottom: '1px solid var(--clr-border)' }}>
                          <strong>{r.athlete}</strong>
                          <span>{r.category}</span>
                          <span>{r.location}</span>
                          <span className={`medal-badge medal-badge--${r.medal}`}>{MEDAL_LABEL[r.medal]?.[ar ? 'ar' : 'en']}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
              {timeline.length === 0 && <p style={{ textAlign: 'center', padding: '2rem' }}>{ar ? 'لا توجد نتائج' : 'No results'}</p>}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
