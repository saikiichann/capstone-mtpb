/** "Payment Verification" → "payment-verification". Ginagamit ng components/Sidebar.tsx. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
