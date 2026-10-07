import { useEffect, useState } from 'react'

// Error messages for a form, keyed by field name.
// - clearErrors(['a', 'b']) removes those messages (e.g. while typing)
// - showErrors(found) shows them and returns true if there were any; it
//   also moves focus to the first field with a problem
export default function useFieldErrors() {
  const [errors, setErrors] = useState({})
  const [focusRequest, setFocusRequest] = useState(0)

  useEffect(() => {
    if (focusRequest) document.querySelector('[aria-invalid="true"]')?.focus()
  }, [focusRequest])

  function clearErrors(names) {
    if (names.some((name) => errors[name])) {
      setErrors((prev) => {
        const next = { ...prev }
        for (const name of names) delete next[name]
        return next
      })
    }
  }

  function showErrors(found) {
    setErrors(found)
    const hasErrors = Object.keys(found).length > 0
    if (hasErrors) setFocusRequest((n) => n + 1)
    return hasErrors
  }

  return { errors, setErrors, clearErrors, showErrors }
}
