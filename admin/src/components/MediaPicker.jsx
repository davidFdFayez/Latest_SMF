import { useRef, useState } from 'react'
import { mediaApi } from '../api/resources'
import { extractErrorMessage } from '../api/utils'
import { assetUrl } from '../utils'

/**
 * Upload-or-type control for an image or document.
 *
 * Uploads go to the API's media store and come back as a /api/media/… path,
 * which both the website and this console can load. A path can also be typed
 * by hand, for files that already ship with the site under /assets/.
 */
export default function MediaPicker({ value, onChange, kind = 'image', placeholder, disabled = false }) {
  const picker = useRef(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const [previewFailed, setPreviewFailed] = useState(false)

  const isImage = kind === 'image'
  const href = assetUrl(value)

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setBusy(true)
    setProgress(0)
    setError('')
    setPreviewFailed(false)
    try {
      const media = await mediaApi.upload(file, setProgress)
      onChange(media.url)
    } catch (err) {
      setError(extractErrorMessage(err, 'The upload failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cms-media">
      {isImage && (
        <div className="cms-media__preview">
          {!href && <span>No image</span>}
          {href && previewFailed && <span>Preview unavailable</span>}
          {href && !previewFailed && (
            <img key={href} src={href} alt="" onError={() => setPreviewFailed(true)} />
          )}
        </div>
      )}
      <div className="cms-media__controls">
        <input
          type="text"
          dir="ltr"
          value={value ?? ''}
          disabled={disabled}
          placeholder={placeholder || (isImage ? '/assets/images/… or upload an image' : '/api/media/… or https://…')}
          onChange={(event) => {
            setPreviewFailed(false)
            onChange(event.target.value)
          }}
        />
        <div className="cms-media__actions">
          <button
            type="button"
            className="btn btn--secondary btn--small"
            disabled={busy || disabled}
            onClick={() => picker.current?.click()}
          >
            {busy ? `Uploading… ${progress}%` : isImage ? 'Upload image' : 'Upload file'}
          </button>
          {value && !isImage && (
            <a className="btn btn--ghost btn--small" href={href} target="_blank" rel="noreferrer">
              Open
            </a>
          )}
          {value && !disabled && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange('')}>
              Clear
            </button>
          )}
        </div>
        <input
          ref={picker}
          type="file"
          hidden
          accept={isImage ? 'image/jpeg,image/png,image/webp,image/gif' : 'application/pdf,image/jpeg,image/png,image/webp'}
          onChange={handleFile}
        />
        {error && <span className="field__error">{error}</span>}
      </div>
    </div>
  )
}
