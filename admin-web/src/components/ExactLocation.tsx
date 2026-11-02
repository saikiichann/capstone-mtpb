import { MapPin } from "lucide-react";
import type { LocationDetails } from "../lib/locationDetails";
import "./ExactLocation.css";

/** Exact spot + "Map" link (opens Google Maps at the GPS point). */
export default function ExactLocation({ details }: { details: LocationDetails }) {
  return (
    <div className="exact-loc">
      <span className="exact-loc-text">{details.exact}</span>
      {details.mapUrl && (
        <a
          className="exact-loc-map"
          href={details.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`${details.coords?.lat.toFixed(5)}, ${details.coords?.lng.toFixed(5)}`}
        >
          <MapPin size={12} />
          Map
        </a>
      )}
    </div>
  );
}
