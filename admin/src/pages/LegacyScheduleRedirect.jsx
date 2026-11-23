import { Navigate, useParams } from 'react-router-dom'

/** The old per-tournament schedule address now opens Bout Schedule for the same tournament. */
export default function LegacyScheduleRedirect() {
  const { id } = useParams()
  return <Navigate to={`/bout-schedule?tournament=${id}`} replace />
}
