import { useId } from 'react'

// Small label + control used on the Pay Now and Add Vehicle forms.
// `children` is a function that receives the props for the input/select:
//   <CompactField label="Color" error={errors.color}>
//     {(props) => <input {...props} value={color} onChange={...} />}
//   </CompactField>
export default function CompactField({ label, error, hint, children }) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div className="compact-field">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : hint ? hintId : undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="compact-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}
