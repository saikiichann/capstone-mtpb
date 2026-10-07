import { formatDateTime } from '../../utils/format'

// Personal details shown on Profile Information, and the checks used by
// Edit Profile. Field names follow the Violators documents
// (full_name, mobile_number, ...).
const PH_MOBILE = /^(09|\+639)\d{9}$/

export const EDITABLE_FIELDS = [
  {
    name: 'full_name',
    label: 'Full Name',
    placeholder: 'Juan Dela Cruz',
    autoComplete: 'name',
    maxLength: 70,
    check: (value) => (value.trim().length < 2 ? 'Enter your full name.' : ''),
  },
  {
    name: 'mobile_number',
    label: 'Mobile Number',
    placeholder: '09XX XXX XXXX',
    autoComplete: 'tel',
    inputMode: 'tel',
    maxLength: 15,
    check: (value) =>
      PH_MOBILE.test(value.replace(/[\s-]/g, '')) ? '' : 'Use an 11-digit number like 09171234567.',
  },
  {
    name: 'address',
    label: 'Address',
    placeholder: '123 Rizal St., Manila, 1000',
    autoComplete: 'street-address',
    maxLength: 120,
    optional: true,
    check: () => '',
  },
]

export function checkProfile(draft) {
  const found = {}
  for (const field of EDITABLE_FIELDS) {
    const value = String(draft[field.name] ?? '')
    if (field.optional && !value.trim()) continue
    const message = field.check(value)
    if (message) found[field.name] = message
  }
  return found
}

export function draftFromProfile(profile) {
  return Object.fromEntries(EDITABLE_FIELDS.map((f) => [f.name, profile?.[f.name] ?? '']))
}

export function cleanProfile(draft) {
  const changes = {}
  for (const field of EDITABLE_FIELDS) {
    const value = String(draft[field.name] ?? '').trim()
    changes[field.name] = field.name === 'mobile_number' ? value.replace(/[\s-]/g, '') : value
  }
  return changes
}

// "Sep 18, 2026", or '' when the record has no created_at yet.
export function memberSince(profile) {
  return formatDateTime(profile?.created_at, { short: true }).split(' - ')[0] ?? ''
}
