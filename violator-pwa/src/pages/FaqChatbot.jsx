import { useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { OFFICE_HOURS } from '../data/contact'
import { FAQ_CATEGORIES, FAQ_ENTRIES } from '../data/faq'
import { IMPOUND_LOTS } from '../data/places'

// Figma "FAQS 1". Preset questions only — the system has no complaint module,
// so this page answers the common ones and points to the MTPB office.
// Search matches the question and the answer, so "gcash" finds the payment
// entry even though the question doesn't say it.
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[*’']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function FaqChatbot() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [openId, setOpenId] = useState(null)

  const terms = normalize(query).split(' ').filter(Boolean)

  // Searching looks through every category, otherwise the chips would hide
  // the answer someone just typed.
  const activeCategory = terms.length > 0 ? 'all' : category
  const shown = FAQ_ENTRIES.filter((entry) => {
    if (activeCategory !== 'all' && entry.category !== activeCategory) return false
    if (terms.length === 0) return true
    const haystack = normalize(`${entry.question} ${entry.answer}`)
    return terms.every((term) => haystack.includes(term))
  })

  const office = IMPOUND_LOTS[0]

  return (
    <div className="page">
      <PageHeader title="FAQs" back />

      <main className="page__body faq-page">
        <p className="faq-page__intro">
          Answers to the questions we get most often. Tap a question to see the full answer.
        </p>

        <div className="faq-search">
          <SearchIcon />
          <input
            type="search"
            className="faq-search__input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search questions"
            aria-label="Search questions"
          />
          {query !== '' && (
            <button
              type="button"
              className="faq-search__clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="faq-chips" role="group" aria-label="Filter by topic">
          {FAQ_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="faq-chip"
              aria-pressed={activeCategory === c.id}
              onClick={() => {
                setCategory(c.id)
                setQuery('')
                setOpenId(null)
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {terms.length > 0 && (
          <p className="faq-page__count" role="status">
            {shown.length} {shown.length === 1 ? 'result' : 'results'} for “{query.trim()}”
          </p>
        )}

        {shown.length === 0 ? (
          <div className="faq-empty">
            <p className="faq-empty__title">No question matches that.</p>
            <p className="faq-empty__text">
              Try a different word, or visit the MTPB Office and our personnel will assist you.
            </p>
            <Link className="text-link" to="/impound">
              See the office location
            </Link>
          </div>
        ) : (
          <ul className="faq-list">
            {shown.map((entry) => {
              const isOpen = openId === entry.id
              const answerId = `faq-answer-${entry.id}`
              return (
                <li key={entry.id} className={`faq-item${isOpen ? ' faq-item--open' : ''}`}>
                  <button
                    type="button"
                    className="faq-item__question"
                    onClick={() => setOpenId(isOpen ? null : entry.id)}
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                  >
                    <span className="faq-item__badge" aria-hidden="true">
                      ?
                    </span>
                    <span className="faq-item__text">{entry.question}</span>
                    <ChevronIcon />
                  </button>

                  {isOpen && (
                    <div id={answerId} className="faq-item__answer">
                      <p>
                        <FaqAnswer text={entry.answer} />
                      </p>
                      {entry.link && (
                        <Link className="faq-item__link" to={entry.link.to}>
                          {entry.link.label}
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <section className="faq-office" aria-label="MTPB Office">
          <h2 className="faq-office__title">MTPB Office</h2>
          <p className="faq-office__address">{office.address}</p>
          <p className="faq-office__hours">{OFFICE_HOURS}</p>
          <Link className="faq-office__link" to="/impound">
            View on map
          </Link>
        </section>

        <p className="faq-page__footer">For further concerns, please visit our office.</p>
      </main>
    </div>
  )
}

// Renders **bold** segments from the FAQ answers (used for the office address).
function FaqAnswer({ text }) {
  const parts = text.split('**')
  return parts.map((part, index) =>
    index % 2 === 1 ? <strong key={`b${index}`}>{part}</strong> : <span key={`t${index}`}>{part}</span>,
  )
}

function SearchIcon() {
  return (
    <svg className="faq-search__icon" width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
      <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 11l4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg className="faq-item__chevron" width="14" height="9" viewBox="0 0 14 9" aria-hidden="true">
      <path
        d="M1 1.2L7 7.2L13 1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
