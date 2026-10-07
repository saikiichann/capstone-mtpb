import evidenceFront from '../assets/vehicle-photo-sedan-large.webp'
import evidencePlate from '../assets/vehicle-photo-suv-1.webp'

// Sample records copied from the Figma mockups. Used when Firebase isn't
// configured yet, or when VITE_USE_SAMPLE_DATA=true in .env.local.

export const sampleUser = {
  fullName: 'Jeane Marco Suarez',
}

// Vehicles shown on the dashboard and (later) My Vehicles.
export const sampleVehicles = [
  {
    id: 'sample-vehicle-1',
    ownerUid: 'demo',
    plateNumber: 'ABC 1234',
    make: 'Toyota',
    model: 'Vios',
    year: 2022,
    vehicleType: 'Sedan',
    wheelCategory: '4 Wheels',
    color: 'Red',
    category: 'car',
    verificationStatus: 'active',
    photoUrl: null,
    createdAt: '2026-04-01T08:00:00+08:00',
  },
  {
    id: 'sample-vehicle-2',
    ownerUid: 'demo',
    plateNumber: '123 ABC',
    make: 'Suzuki',
    model: 'Hayabusa',
    year: 2023,
    vehicleType: 'Motorcycle',
    wheelCategory: '2 Wheels',
    color: 'Black',
    category: 'motorcycle',
    verificationStatus: 'active',
    photoUrl: null,
    createdAt: '2026-04-15T08:00:00+08:00',
  },
]

// Violations for the sample owner's vehicles. `status` is where the vehicle
// is (clamped / impounded); `paymentStatus` is whether the fine is paid.
// The Figma mockups use different amounts for the same CIN on different
// screens, so these follow the first Violation Details screen.
export const sampleViolations = [
  {
    id: 'sample-clmp-2026-0055',
    cin: 'CLMP-2026-0055',
    clampId: 'R-24',
    clampedAt: '2026-04-29T09:15:00+08:00',
    status: 'clamped',
    paymentStatus: 'unpaid',
    plateNumber: 'ABC 1234',
    vehicleMake: 'Toyota Vios 2020',
    vehicleType: 'Sedan',
    vehicleColor: 'Black',
    violationType: 'Illegal Parking',
    location: 'Roxas Blvd. Manila',
    fineAmount: 900,
    officerName: 'Juan Dela Cruz',
    // From the enforcer app. Placeholder pictures so the strip can be seen.
    evidencePhotos: [
      { url: evidenceFront, caption: 'Front view' },
      { url: evidencePlate, caption: 'Clamp and plate' },
    ],
  },
  {
    id: 'sample-imp-2026-0056',
    cin: 'IMP-2026-0056',
    clampId: 'R-31',
    clampedAt: '2026-05-10T10:29:00+08:00',
    status: 'impounded',
    paymentStatus: 'unpaid',
    plateNumber: 'ABC 1234',
    vehicleMake: 'Toyota Vios 2020',
    vehicleType: 'Sedan',
    vehicleColor: 'Black',
    violationType: 'Illegal Parking',
    location: 'Quezon Blvd. Manila',
    fineAmount: 900,
    officerName: 'Juan Dela Cruz',
  },
  {
    id: 'sample-clmp-2026-0041',
    cin: 'CLMP-2026-0041',
    clampId: 'R-26',
    clampedAt: '2026-03-18T14:05:00+08:00',
    status: 'clamped',
    paymentStatus: 'paid',
    plateNumber: '123 ABC',
    vehicleMake: 'Suzuki Hayabusa 2023',
    vehicleType: 'Motorcycle',
    vehicleColor: 'Gray',
    violationType: 'No Parking',
    location: 'Taft Ave. Manila',
    fineAmount: 750,
    officerName: 'Maria Santos',
  },
]

// Registered clamps, the way the admin app would store them. The QR sticker
// on each clamp points at /q/<id>.
export const sampleClamps = [
  // Document id = the QR id on the sticker; clampNumber is stamped on the
  // clamp itself so the enforcer knows which one they picked up.
  { id: 'CLMP-2026-0055', clampNumber: 'R-24', status: 'for_payment', currentCin: 'CLMP-2026-0055' },
  { id: 'CLMP-2026-0070', clampNumber: 'R-25', status: 'waiting', currentCin: '' },
  { id: 'CLMP-2026-0041', clampNumber: 'R-26', status: 'paid', currentCin: 'CLMP-2026-0041' },
  { id: 'IMP-2026-0056', clampNumber: 'R-31', status: 'ready_for_release', currentCin: 'IMP-2026-0056' },
]

// A finished sandbox payment for CLMP-2026-0041, so the paid state and its
// receipt can be seen without paying first.
export const samplePayments = [
  {
    referenceNumber: 'REF-2026-00121',
    violationCin: 'CLMP-2026-0041',
    plateNumber: '123 ABC',
    violationType: 'No Parking',
    location: 'Taft Ave. Manila',
    officerName: 'Maria Santos',
    status: 'paid',
    fineAmount: 750,
    convenienceFee: 19.22,
    amount: 769.22,
    method: 'gcash',
    paidAt: '2026-03-18T16:40:00+08:00',
    email: '',
    sandbox: true,
  },
]
