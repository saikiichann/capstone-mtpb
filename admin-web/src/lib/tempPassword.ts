/* ------------------------------------------------------------------
   TEMPORARY PASSWORD — for new staff accounts (User Management).

   Random, from the browser's cryptographic generator (Web Crypto), so
   the IT Admin no longer types one in (and no two accounts share it).
   Same rules as the staff password reset (violator-pwa/server/
   staff-password.js): no look-alike characters (0/O, 1/l/I), at least
   one letter and one digit. The person must set their own password at
   the first login (mustChangePassword).
------------------------------------------------------------------ */
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";

/** Unbiased random integer in [0, max). */
const randomInt = (max: number): number => {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
};

export function generateTempPassword(length = 10): string {
  const all = LETTERS + DIGITS;
  const chars = Array.from({ length }, () => all[randomInt(all.length)]);
  chars[randomInt(length)] = DIGITS[randomInt(DIGITS.length)];
  let i = randomInt(length);
  while (DIGITS.includes(chars[i])) i = (i + 1) % length;
  chars[i] = LETTERS[randomInt(LETTERS.length)];
  return chars.join("");
}
