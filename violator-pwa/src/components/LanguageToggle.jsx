import { useLanguage } from '../i18n/language-context'

// The small "FIL" / "EN" button in the header of the guest screens. It names
// the language you switch TO, the way most Philippine apps do it.
export default function LanguageToggle() {
  const { lang, setLang } = useLanguage()
  const toFilipino = lang !== 'fil'

  return (
    <button
      type="button"
      className="language-toggle"
      onClick={() => setLang(toFilipino ? 'fil' : 'en')}
      aria-label={toFilipino ? 'Switch to Filipino' : 'Lumipat sa English'}
      lang={toFilipino ? 'fil' : 'en'}
    >
      {toFilipino ? 'FIL' : 'EN'}
    </button>
  )
}
