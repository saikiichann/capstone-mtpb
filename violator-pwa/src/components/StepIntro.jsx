// "Step 1 of 3" + heading + description, shown under the header of the
// Pay Now and Add Vehicle flows.
export default function StepIntro({ step, total = 3, title, children }) {
  return (
    <div className="step-intro">
      <p className="step-intro__step">
        Step {step} of {total}
      </p>
      <h2 className="step-intro__title">{title}</h2>
      {children && <p className="step-intro__text">{children}</p>}
    </div>
  )
}
