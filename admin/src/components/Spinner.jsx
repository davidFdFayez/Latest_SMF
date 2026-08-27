export default function Spinner({ label = 'Loading…', fullWidth = true }) {
  return (
    <div className={`spinner-wrap${fullWidth ? ' spinner-wrap--full' : ''}`}>
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
