/* ------------------------------------------------------------------
   CSV SAFE — keeps exported text from running as a spreadsheet formula

   Some exported values are typed by the public (violator names and
   emails from the violator app). A value that starts with = + - @ (or a
   tab / carriage return) can run as a formula when the CSV is opened in
   Excel or Google Sheets ("CSV injection"). Putting an apostrophe in
   front makes the spreadsheet show it as plain text. Numbers are left
   alone so totals still add up.
------------------------------------------------------------------ */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: neutralised, quoted when needed. */
export const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  let str = String(value);
  if (FORMULA_START.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};
