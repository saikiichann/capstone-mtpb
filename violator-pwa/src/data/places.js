// Map locations used in the app.
//
// TODO: the coordinates below are an estimate worked out from the
// "Central Market Impounding" map screenshot in Figma (measured against
// Manila City Jail at 14.60486, 120.98365). Confirm the exact spot: in
// Google Maps, right-click the impound lot and click the coordinates to copy
// them, then paste them here.
export const IMPOUND_LOTS = [
  {
    id: 'central-market',
    name: 'Central Market Impounding',
    area: 'Santa Cruz, Manila',
    address: 'Central Market, Santa Cruz, Manila, 1008 Metro Manila',
    position: [14.6065, 120.9853],
  },
]

export const MANILA_CENTER = [14.5995, 120.9842]

export function directionsUrl([lat, lng]) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}
