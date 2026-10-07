import { Link, useLocation } from 'react-router-dom'
import welcomeCar from '../assets/welcome-car.webp'
import mtpbLogo from '../assets/mtpb-logo.webp'

// Figma "APP" (527:844). Layout measured from a screenshot of the frame.
export default function Welcome() {
  const location = useLocation()
  const state = location.state // keeps returnTo when coming from a QR link

  return (
    <div className="welcome">
      <img className="welcome__car" src={welcomeCar} width={402} height={459} alt="" />
      <div className="welcome__fade" aria-hidden="true" />

      <header className="welcome__brand">
        <img
          className="welcome__logo"
          src={mtpbLogo}
          width={148}
          height={150}
          alt="Manila Traffic and Parking Bureau seal"
        />
        <h1 className="welcome__title">MTPB</h1>
        <p className="welcome__subtitle">Vehicle Owner App</p>
      </header>

      <div className="welcome__actions">
        <Link className="btn btn--lg btn--primary welcome__cta" to="/signup" state={state}>
          Get Started
        </Link>
        <p className="welcome__login">
          Already have an account?{' '}
          <Link className="link-accent" to="/login" state={state}>
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}
