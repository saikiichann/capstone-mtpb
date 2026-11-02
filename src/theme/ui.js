// ============================================================================
// Enforcer app look (from the "MTPB Enforcer App Redesign" canvas).
// Black header, light grey ground, white cards, amber only for scanning.
// Big text and 44+ px touch targets so it is easy to use outdoors.
// ============================================================================
export const ui = {
  ink: '#0E0F12', // headers, primary buttons, main text
  ink2: '#1C1E24', // dark surfaces inside the header
  ground: '#F3F4F6', // screen background
  card: '#FFFFFF',
  line: '#E3E5E9', // card borders
  field: '#D5D8DE', // input borders
  text2: '#3A3F4A', // secondary text (8.9:1 on white)
  muted: '#5B616E', // small labels (6.2:1 on white)
  onDarkMuted: '#A9AEB8', // small text on the black header
  accent: '#FFB800', // scan button only
  good: '#23A455',
  goodSoft: '#DFF3E6',
  danger: '#A61B1B',
  dangerSoft: '#FDE7E7',
  white: '#FFFFFF',
};

export const radius = { card: 20, field: 14, button: 16 };

/** "Magandang umaga / hapon / gabi" for the home greeting. */
export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Magandang umaga,';
  if (h < 18) return 'Magandang hapon,';
  return 'Magandang gabi,';
}

/**
 * "JD" from "Juan Dela Cruz": first name + surname. Filipino surnames often
 * start with a particle (Dela Cruz, De Leon, San Jose), so the surname's
 * initial comes from that particle.
 */
const SURNAME_PARTICLES = ['de', 'dela', 'del', 'delos', 'della', 'di', 'san', 'sta', 'sta.', 'santa', 'santo', 'van', 'von'];

export function initialsOf(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  const p = parts.findIndex((w, i) => i > 0 && SURNAME_PARTICLES.includes(w.toLowerCase()));
  const surname = p > 0 ? parts[p] : parts[parts.length - 1];
  return (parts[0][0] + surname[0]).toUpperCase();
}

/** Short enforcer ID shown on Home and Profile (first 8 of the account id). */
export const enforcerIdOf = (uid) => (uid ? String(uid).slice(0, 8).toUpperCase() : '—');
