/**
 * A section that is not built yet (Draw, Results): its heading and one quiet
 * card saying it will appear here. No brackets, bouts or scores are shown —
 * nothing is invented until the real section exists.
 */
export default function TournamentPlaceholder({ id, title, message, Icon }) {
  return (
    <section className="tsection" aria-labelledby={id}>
      <h2 id={id} className="tsection__title">{title}</h2>
      <div className="tpage-card tsection__placeholder">
        {Icon && <Icon className="tsection__placeholder-icon" aria-hidden="true" />}
        <p>{message}</p>
      </div>
    </section>
  );
}
