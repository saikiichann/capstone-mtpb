// MTPB contact details used by Help & Support.
// TODO: replace these with the real MTPB address and phone number before the
// defense — they're placeholders taken from the mockups.
export const SUPPORT_EMAIL = 'support@mtpb.example.ph'
export const OFFICE_PHONE = '(02) 8888 0000'
export const OFFICE_HOURS = 'Monday to Friday, 8:00 AM – 5:00 PM'

// Opens the phone's email app with the subject and body already filled in.
export function supportMailto({ subject, lines = [] }) {
  const body = lines.filter(Boolean).join('\n')
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
