import { createContext, useContext } from 'react'
import { STRINGS } from './strings.js'

// English / Filipino for the screens a guest sees after scanning a clamp:
// Scanned Clamp, Violation Details, Pay Now, Payment Successful, Receipt
// (around the receipt card), FAQs and Impound Location. The rest of the app
// stays in English. The official receipt card itself stays in English too,
// since MTPB staff read it.

export const LANGUAGES = ['en', 'fil']

export const LanguageContext = createContext({ lang: 'en', setLang: () => {} })

export function useLanguage() {
  return useContext(LanguageContext)
}

// "Hakbang {step} sa {total}" + { step: 1, total: 3 } → "Hakbang 1 sa 3".
// Falls back to English, then to the key, so a missing translation shows
// English rather than nothing.
export function translate(lang, key, vars) {
  const text = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
}

export function useT() {
  const { lang } = useLanguage()
  return (key, vars) => translate(lang, key, vars)
}
