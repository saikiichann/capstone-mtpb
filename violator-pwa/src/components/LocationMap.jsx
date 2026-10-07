import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'

// Leaflet's default marker images don't survive bundling unless their
// URLs are set explicitly.
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Interactive map (Leaflet + OpenStreetMap). No API key or billing needed.
// `markers`: [{ id, position: [lat, lng], label }]
// The admin dashboard's Sector 3 heatmap can use the same stack with the
// leaflet.heat plugin, so both apps stay on one map library.
//
// OpenStreetMap's free tiles are fine for development and a capstone demo.
// For a real public launch, switch the TileLayer URL to a tile provider
// (for example MapTiler or Stadia Maps) with your own key.
export default function LocationMap({ center, zoom = 16, markers = [], height = 240, label }) {
  return (
    <div className="location-map" style={{ height }} role="region" aria-label={label || 'Map'}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {markers.map((marker) => (
          <Marker key={marker.id} position={marker.position} icon={defaultIcon} title={marker.label}>
            {marker.label && <Popup>{marker.label}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
