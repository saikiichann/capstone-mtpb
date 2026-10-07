# MTPB Violator PWA — project context

Notes for Claude Code. Read this before changing anything.
Last updated 2026-10-08.

## Who and what

- **Capstone project:** MTPB Integrated Enforcement System (Manila Traffic and Parking Bureau), BSIT capstone at NTC.
- **Three apps, three people:**
  - **Marco**: this app, the **violator PWA** (vehicle owners and guests check and pay violations). Marco prefers **English**.
  - **Mira**: the **admin** web app (`admin-web/`, React + TypeScript), and owner of the shared Firebase project.
  - **Ian**: the **enforcer** React Native app. Not connected yet.
- Shared repo: `https://github.com/saikiichann/capstone-mtpb` (this app goes in `violator-pwa/`).
  Marco's original repo `https://github.com/Mcdoggy00/mtpb-violators-pwa` is kept as a backup.
- **Android only.** iOS is not a target.
- Marco uses Windows and **PowerShell** (use `cd D:\path`, not `cd /d`).

## Ground rules (important)

- **Mira's admin app and the shared Firestore are the final system.** This app adapts to them, never the other way round.
- **Never change Mira's code or the Firestore structure, rules or data.** Reading is fine. During real use the backend
  may write to her collections, but only exactly what her own app would write.
- **Ask before building.** Propose, list what will change, and wait for "go" on anything non-trivial.
- **Don't add things he didn't ask for.** If a change has a side effect or you see a related problem, mention it and ask.
- When he says "don't do anything yet / wait until I say go", hold.
- Keep a **running list** of changes since the last commit, and ask before committing or pushing.
- Always run lint, tests and `npm run build` before pushing. Vercel runs the same build.
- Keep answers short and concrete. He's on a capstone deadline.

## Stack

- React 19 + Vite 8 (rolldown), react-router-dom 7, plain CSS (`src/index.css` tokens, `src/App.css`), oxlint, vite-plugin-pwa.
- Firebase Auth (email/password + **anonymous** for guests) and Firestore.
- Payments: **PayMongo Checkout Sessions, test mode only, GCash only** (Maya was removed), via Vercel functions in `api/` and `server/`.
- Firebase Admin SDK in the functions. **Keep `firebase-admin` on `^13.10.0`.** v14 pulls in ESM-only jose 6 and
  crashes Vercel functions with `ERR_REQUIRE_ESM`.
- Photos and files: **Supabase Storage, not Firebase Storage** (cost). Firestore only stores URLs.

## Checks

```
npx oxlint src server api
npm run test:server        # 22 tests
npm run build
```

With no Firebase env (or `VITE_USE_SAMPLE_DATA=true`) the app runs on sample data from `src/data/sample.js`.

## Firebase / environment

- Shared project: **`mtpb-integrated-enforcem-9e6f8`** (Mira's). Security rules are hers; this repo ships none.
- Client env (`.env.local`, gitignored): see `.env.example`. Server env (Vercel only): see `.env.server.example`.
- **Never print, paste or commit** the service account JSON, `sk_test_…` or `whsk_…` values. Don't force-push. Stay in PayMongo test mode.
- PayMongo webhooks only reach the **Vercel URL**, never localhost. The success page polls `/api/confirm-payment` as well.
- `scripts/inspect-schema.mjs` is a read-only Firestore dump (needs `GOOGLE_APPLICATION_CREDENTIALS`).

## Architecture notes

- **`src/firebase/mapping.js` is the translation layer** for Mira's field names and status words. If a name changes, edit this file only.
  - Violation `paymentStatus`: `Unpaid` → `Pending Verification` → `Verified` / `Rejected`. Both `Pending Verification` and
    `Verified` count as paid (`awaitingVerification` tells them apart); `Rejected` is unpaid with `rejectionReason`.
  - `isPaymentSettled()` decides whether a violation can still be paid online.
  - Clamp state is **derived like Mira's QR Management**: `releasedAt` → released, `readyAt` → ready, `paidAt` → paid,
    `deployedAt`/`cin`/`currentViolationId` → for payment, else waiting. The stored `status` isn't trusted.
- **Payments** (`server/payments-service.js`, `server/firestore-store.js`):
  - Pay Now creates a document in the backend-only `checkoutAttempts` (random id). No REF number yet.
  - When PayMongo confirms, one transaction takes the next REF from Mira's `counters/paymentReference` (`lastValue`),
    creates a `payments` doc in her format (`method: "GCash"`, `status: "pending"`, plus `uid`, `checkoutAttemptId`,
    `paymongoPaymentId`, `livemode`) and sets the violation to `Pending Verification`. Her Payment Verification takes over.
  - The PWA doesn't touch clamps or release status.
  - `/api/confirm-payment` takes `{ attemptId }` and returns `{ status, payment }` (the browser can't read attempts).
  - Receipts are found by `where uid ==` + `where referenceNumber ==`, with violation details filled from the violation.
- **QR stickers:** `/scan?t=<scanToken>` → `/q/<token>`. Clamps are found by `scanToken` **only** (Marco's choice:
  clamp numbers in links must not work). The scan page shows the clamp number, never the token.
- `src/firebase/schema.js`: collection names. `envValue()` reads `import.meta.env` **or** `process.env`, because
  the same file is imported by Vercel functions.
- `src/auth/AuthProvider.jsx`: guests are signed in **anonymously**. `guestChoseCheckout` remembers whether the guest
  picked "Pay now as guest".
- Receipt download (`src/pages/pay/Receipt.jsx`): the PNG is prepared when the receipt opens, then a plain download.
- `INTEGRATION.md` documents every shared collection.

### CSS gotcha

`src/App.css` is ~4,200 lines and has **duplicate section comments** (e.g. two `/* ---------- Bottom nav ---------- */`).
A scripted edit once matched the first one and silently deleted 3,500 lines. **Append new blocks at the end, or
edit by exact unique strings. Never cut between comment markers.** Check the line count before and after.

## Product decisions already made (don't undo without asking)

**Vehicles**
- Owners **cannot add or edit vehicles.** Vehicles are attached automatically by the MTPB side.
- Home's vehicle card is **display only** (a "wallet pass" design, `.vehicle-hero`).
- **Open question:** Vehicle Details still has a red **Remove Vehicle** button. Marco hasn't decided yet.

**Payments**
- GCash only. Pay Onsite shows the office.
- After paying: **"paid – awaiting verification"** until Mira's staff verify it, then **paid**. Rejected → payable again,
  with the reason shown.
- A failed, expired or cancelled checkout simply leaves the violation unpaid.
- **Payment History lists only completed payments.** (All and Paid tabs show the same list; Marco hasn't decided.)
- The amount due is shown **only on the History page**, not on Home.

**Navigation**
- Violation History and Payment History: back always goes to **History**, except Violation History opened from a
  vehicle's **View Violations**, which goes back to that vehicle (`state.from`).

**Look and feel**
- Quick Access icons in coloured circles: Vehicles blue `#2f6fe0`, Violations amber `#f0a52c`, Payments green
  `#17a05a`, FAQs violet `#7a52d1`.
- Profile Information and Account Settings share the gradient hero card (`.profile-hero`).
- Profile has **no driver's licence** field. No demo-mode banners.
- Animations are CSS-only and respect `prefers-reduced-motion`.

**Other**
- **Report a Problem** shows the MTPB office details and map (legal concerns are handled in person).
- Evidence photos: the section hides when a violation has none.
- Impounded violations can still be paid online. Don't change this unless Marco brings it up.

## Open items

1. **Old sample payments** written by the PWA's previous flow are still in Mira's `payments` (ids starting `REF-`, with
   `uid`), plus `counters/payments`. Plan: a read-only listing, then Marco or Mira deletes them. Claude never deletes.
2. **`/v/<cin>`** opens a violation without the QR token; CINs are sequential. Decide with Mira whether to restrict it.
3. Confirm Ian's evidence-photo field names.
4. Placeholders: `src/data/contact.js` (support email, phone); confirm the office in `src/data/places.js`.
5. Not done, only offered: highlight the **History** tab in the bottom nav while on Violation/Payment History.
