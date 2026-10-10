import { useT } from '../i18n/language-context'

// "Step 1 of 3" + heading + description, shown under the header of the
// Pay Now and Add Vehicle flows.
export default function StepIntro({ step, total = 3, title, children }) {
  const t = useT()
  return (
    <div className="step-intro">
      <p className="step-intro__step">{t('step.of', { step, total })}</p>
      <h2 className="step-intro__title">{title}</h2>
      {children && <p className="step-intro__text">{children}</p>}
    </div>
  )
}
