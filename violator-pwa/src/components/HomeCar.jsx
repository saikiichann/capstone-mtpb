import carPhoto from '../assets/home-car.webp'

// Home's car: decorative, the same for everyone, not tied to any vehicle
// (Marco, 2026-10-14: no box and no vehicle details). It slides in from the
// right and stops, leaving two skid marks behind its tyres (App.css,
// "Home car"). The photo's white background blends into the page.
export default function HomeCar() {
  return (
    <div className="home-car" aria-hidden="true">
      <span className="home-car__skid home-car__skid--rear" />
      <span className="home-car__skid home-car__skid--front" />
      <div className="home-car__art">
        <span className="home-car__shadow" />
        <img className="home-car__photo" src={carPhoto} width={300} height={170} alt="" />
      </div>
    </div>
  )
}
