import { useEffect, useState } from 'react'
import { LANGUAGES, LanguageContext } from './language-context'

const STORAGE_KEY = 'mtpb-language'

function savedLanguage() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.includes(value) ? value : 'en'
  } catch {
    return 'en'
  }
}

// Remembers the choice on this phone, so a guest who switched to Filipino on
// the violation keeps it through payment and the receipt.
export default function LanguageProvider({ children }) {
  const [lang, setLang] = useState(savedLanguage)

  useEffect(() => {
    document.documentElement.lang = lang === 'fil' ? 'fil' : 'en'
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Storage unavailable: the choice lasts until the page is closed.
    }
  }, [lang])

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
}
