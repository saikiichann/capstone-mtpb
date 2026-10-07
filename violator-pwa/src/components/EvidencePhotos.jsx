import { useState } from 'react'
import Modal from './Modal'

// Photos the enforcer took when the clamp went on (see evidencePhotosOf in
// ../utils/evidence.js for the shapes accepted).

export default function EvidencePhotos({ photos }) {
  const [openIndex, setOpenIndex] = useState(-1)
  if (photos.length === 0) return null
  const open = photos[openIndex]

  return (
    <section className="evidence" aria-label="Evidence photos">
      <h3 className="evidence__title">Evidence Photos</h3>
      <ul className="evidence__strip">
        {photos.map((photo, index) => (
          <li key={photo.key}>
            <button
              type="button"
              className="evidence__thumb"
              onClick={() => setOpenIndex(index)}
              aria-label={photo.caption ? `View ${photo.caption}` : `View photo ${index + 1}`}
            >
              <img src={photo.url} alt={photo.caption} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      <p className="evidence__note">Taken by the enforcer when the clamp was placed.</p>

      <Modal open={openIndex >= 0} onClose={() => setOpenIndex(-1)} labelledBy="evidence-title" className="photo-modal">
        <h2 id="evidence-title" className="photo-modal__title">
          {open?.caption || `Photo ${openIndex + 1} of ${photos.length}`}
        </h2>
        {open && <img className="photo-modal__image" src={open.url} alt={open.caption} />}
        <div className="photo-modal__actions">
          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="btn btn--pay btn--outline"
                onClick={() => setOpenIndex((i) => (i - 1 + photos.length) % photos.length)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn--pay btn--outline"
                onClick={() => setOpenIndex((i) => (i + 1) % photos.length)}
              >
                Next
              </button>
            </>
          )}
          <button type="button" className="btn btn--pay btn--primary" onClick={() => setOpenIndex(-1)}>
            Close
          </button>
        </div>
      </Modal>
    </section>
  )
}
