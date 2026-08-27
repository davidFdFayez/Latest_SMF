import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="not-found">
      <h1>404</h1>
      <p>The page you are looking for doesn't exist.</p>
      <Link to="/" className="btn btn--primary">
        Back to Dashboard
      </Link>
    </div>
  )
}
