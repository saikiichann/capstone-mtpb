import { useState } from 'react'
import { useT } from '../i18n/language-context'
import Modal from './Modal'

// Photos the enforcer took when the clamp went on (see evidencePhotosOf in
// ../utils/evidence.js for the shapes accepted).

export default function EvidencePhotos({ photos }) {
  const t = useT()
  const [openIndex, setOpenIndex] = useState(-1)
  if (photos.length === 0) return null
  const open = photos[openIndex]

  return (
    <section className="evidence" aria-label={t('evidence.label')}>
      <h3 className="evidence__title">{t('evidence.title')}</h3>
      <ul className="evidence__strip">
        {photos.map((photo, index) => (
          <li key={photo.key}>
            <button
              type="button"
              className="evidence__thumb"
              onClick={() => setOpenIndex(index)}
              aria-label={photo.caption ? t('evidence.view', { caption: photo.caption }) : t('evidence.viewPhoto', { n: index + 1 })}
            >
              <img src={photo.url} alt={photo.caption} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      <p className="evidence__note">{t('evidence.note')}</p>

      <Modal open={openIndex >= 0} onClose={() => setOpenIndex(-1)} labelledBy="evidence-title" className="photo-modal">
        <h2 id="evidence-title" className="photo-modal__title">
          {open?.caption || t('evidence.photoOf', { n: openIndex + 1, total: photos.length })}
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
                {t('evidence.previous')}
              </button>
              <button
                type="button"
                className="btn btn--pay btn--outline"
                onClick={() => setOpenIndex((i) => (i + 1) % photos.length)}
              >
                {t('evidence.next')}
              </button>
            </>
          )}
          <button type="button" className="btn btn--pay btn--primary" onClick={() => setOpenIndex(-1)}>
            {t('evidence.close')}
          </button>
        </div>
      </Modal>
    </section>
  )
}
