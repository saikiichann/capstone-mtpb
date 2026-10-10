# MTPB Violator Portal (PWA)

The violator side of the **MTPB Integrated Enforcement System** (Manila
Traffic and Parking Bureau). Vehicle owners and guests scan the QR code on a
clamp, see the violation, and pay it online with GCash. Built by Marco; it
works alongside Mira's admin web app (`admin-web/`) and Ian's enforcer app,
and uses the admin app's Firebase project and data as they are.

**Android only.** The app is built and tested for Android phones (Chrome).
iPhone is not a target.

## Stack

- React 19 + Vite, plain CSS with design tokens (`src/index.css`)
- Poppins, self-hosted with `@fontsource/poppins` so it works offline
- `vite-plugin-pwa` for the manifest and offline service worker
- `react-router-dom` for routing
- Firebase Auth (email/password, plus anonymous sign-in for guests) and
  Firestore. Photos live in Supabase Storage; Firestore only stores their URLs.
- PayMongo test mode (GCash) through Vercel serverless functions (`api/`)
- Leaflet + OpenStreetMap (`react-leaflet`) for maps. No API key needed.

## Run it

```bash
npm install
npm run dev
```

If `.env.local` has no Firebase keys, the app runs in **demo mode**:

- Any email and password logs you in.
- Violations come from `src/data/sample.js`. Try `/v/CLMP-2026-0055`.
- Payments are simulated on the device.

Checks to run before pushing (Vercel runs the same build):

```bash
npx oxlint src server api
npm run test:server
npm run build
```

## Test on your phone

Phones only offer "Add to Home Screen" on `https://` pages, so the phone test
runs over https:

```bash
npm run dev:phone
```

Your phone must be on the same Wi-Fi as your computer. Open the
`https://192.168.x.x:5173` address Vite prints and choose **Advanced →
Proceed** at the certificate warning (the dev certificate is self-signed).

## How it connects to the admin app

The admin app owns the database. This app adapts to it and never changes its
structure. `src/firebase/mapping.js` translates the admin app's field names
and status words; if one changes, that's the only file to edit.
**INTEGRATION.md** describes every collection this app reads or writes.

## Payments

No real money moves: PayMongo runs in **test mode**. `VITE_PAYMENTS_MODE`
picks the mode:

| Mode | What happens |
| --- | --- |
| `demo` (default) | Simulated on the device, saved in `localStorage` |
| `paymongo` | PayMongo's GCash test page, through the Vercel backend |

The screens:

1. Violation Details → **Pay Now** (signed in, or "Pay now as guest").
2. **Step 1:** GCash or Pay Onsite. Pay Onsite shows the office and its map.
3. **Step 2:** mobile number and an optional email.
4. **Step 3:** the total with the fee breakdown. **Confirm Payment** opens
   PayMongo's GCash test page.
5. **Payment Successful:** waits for PayMongo to confirm, then shows the
   REF number.
6. **Receipt:** the download button saves it as a PNG to Downloads.

### What happens behind the scenes

```
Pay Now ──POST /api/create-checkout──▶ backend saves a checkout attempt
                                      (checkoutAttempts) ──▶ PayMongo session
App → PayMongo GCash test page → back to /payments/<attempt id>/success
PayMongo ──webhook──▶ /api/paymongo-webhook ─┐
Success page ──POST /api/confirm-payment ────┴─▶ record the payment
```

Recording a payment happens once, in one Firestore transaction, exactly the
way the admin app records a cash payment:

1. the next **REF number** from the admin app's counter
   (`counters/paymentReference`), shared with cash payments so numbers never
   clash, and only handed out once the money is in
2. a `payments` document in the admin app's format, `method: "GCash"`,
   `status: "pending"`
3. the violation moved to **`Pending Verification`**

Finance staff then verify it in the admin app (Payment Verification). Until
then the violator sees **"paid – awaiting verification"**; once verified it
shows **paid**. If staff reject it, the violation is payable again and shows
their reason.

- The amount always comes from the violation in Firestore, never from the
  phone.
- A violation that is `Pending Verification` or `Verified` can't be paid
  online again. Abandoned checkouts stay in `checkoutAttempts` and never
  reach the admin app.
- The PayMongo secret key and the Firebase service account exist only in
  Vercel.
- Backend code: `api/` (3 endpoints) and `server/` (shared logic, tested with
  a fake PayMongo: `npm run test:server`).

### Convenience fee

`src/payments/fees.js` adds GCash's fee on top of the fine, using PayMongo's
published rate plus VAT and its pass-on-fee formula: a ₱900 fine is ₱923.06.
It's the only place the rate lives; the app and the backend both use it. Set
`PASS_FEES_TO_PAYER = false` if MTPB absorbs the fee. Check the
[PayMongo pricing page](https://www.paymongo.com/en-ph/pricing) before the
defense in case the rate changed.

## Deploying (Vercel + PayMongo test mode)

Everything stays on free plans: Firebase Spark, Vercel Hobby and PayMongo
test mode. The live setup and a step-by-step checklist are in
[DEPLOYMENT.md](DEPLOYMENT.md).

1. **Firebase (the admin app's project).** Security rules belong to the admin
   app; this repo doesn't ship any. Make sure **Authentication → Sign-in
   method** has **Email/Password** and **Anonymous** (guests) enabled, and
   add the Vercel domain under **Authentication → Settings → Authorized
   domains**. Get a service-account key from **Project settings → Service
   accounts**. Keep it private: never commit it or paste it in chats.
2. **PayMongo.** **Developers → API Keys** → the test secret key (`sk_test_…`).
3. **Vercel.** Import the repo (Root Directory: this app's folder) and add
   the environment variables from `.env.example` (`VITE_…`, with
   `VITE_PAYMENTS_MODE=paymongo`) and `.env.server.example`
   (`PAYMONGO_SECRET_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `APP_URL`,
   `ALLOWED_ORIGINS`, `PAYMONGO_WEBHOOK_SECRET`).
4. **PayMongo webhook.** **Developers → Webhooks → Add endpoint**:
   `https://<your-app>.vercel.app/api/paymongo-webhook`, event
   `checkout_session.payment.paid`. Copy its secret (`whsk_…`) into Vercel as
   `PAYMONGO_WEBHOOK_SECRET`, then redeploy.

If something goes wrong, check **Vercel → Logs** (the functions log their
errors) and **PayMongo → Developers → Webhooks** (each delivery and whether it
succeeded).

**Testing on your computer against the deployed backend:** set
`VITE_PAYMENTS_MODE=paymongo` and `VITE_API_BASE_URL=https://<your-app>.vercel.app`
in `.env.local`. Webhooks can't reach localhost, so the success page asks the
backend to check with PayMongo instead.

**Stay in test mode.** Live keys (`sk_live_…`) would move real money and need
MTPB's business verification with PayMongo; they're out of scope.

## QR codes on the clamps

The admin app's **QR Management** registers each clamp and prints its QR
sticker:

```
https://mtpb-violators-pwa.vercel.app/scan?t=<scan token>
```

The token is random, stored on the clamp as `scanToken`, and can be re-issued
by IT if a sticker is lost or copied. The clamp number is deliberately not in
the link, so **only the token finds a clamp**. `/scan` hands over to
`/q/<token>`, which works out the clamp's state the same way the admin app
does (from `releasedAt`, `readyAt`, `paidAt`, then `deployedAt` / `cin` /
`currentViolationId`):

| Clamp state | What the violator sees |
| --- | --- |
| waiting | "Nothing to pay on this clamp" |
| for payment | The violation, with Pay Now (guest or account) |
| paid / ready for release | The violation marked paid, "wait for an enforcer" |
| released | "This clamp has been released" |

Violations are attached to clamps by the enforcer side. Violators scan with
their phone camera, so the app has no scanner of its own.

## Accounts and guests

- **Sign up** creates the Auth account and a document in the violator profile
  collection (`VITE_VIOLATORS_COLLECTION`, `violators` in the shared project),
  then sends a verification email. **Log in** refuses accounts without that
  document, which keeps staff accounts out.
- **Guests** can pay straight from the QR without signing up: "Pay now as
  guest" signs them in anonymously, so the backend still gets a real Firebase
  token. A guest's receipt is only available while that page is open, so the
  screen tells them to download it; afterwards a copy comes from the MTPB
  office. If a guest signs up later, the account links to the same uid and
  the payment stays theirs.

## Vehicles

Owners **don't add or edit vehicles**. Vehicles are attached to an account by
the MTPB side when a violation is recorded. My Vehicles and Vehicle Details
are display only, and Violation History lists violations for the account's
vehicles.

## Routes

| Route | Screen | Access |
| --- | --- | --- |
| `/scan?t=<token>` | QR sticker link → `/q/<token>` | Anyone |
| `/q/:qrId` | Scanned clamp | Anyone |
| `/v/:violationRef` | Violation Details + pay-or-sign-up choice | Anyone |
| `/faq` | FAQs | Anyone |
| `/impound` | Impound location map | Anyone |
| `/welcome`, `/login`, `/signup` | Welcome, Login, Create Account | Signed out |
| `/verify-email` | Verify Email | Signed in, not verified |
| `/` | Home | Verified |
| `/history` | History (Payment History / Violation History) | Verified |
| `/violations` | Violation History | Verified |
| `/payments` | Payment History | Verified |
| `/vehicles`, `/vehicles/:vehicleId` | My Vehicles, Vehicle Details | Verified |
| `/profile` and `/profile/*` | Account Settings, Profile Information, Edit Profile, Payment Settings, Privacy, Help & Support | Verified |
| `/v/:violationRef/pay` | Pay Now step 1 (method) | Verified or guest |
| `/v/:violationRef/pay/gcash` | Step 2 (details) | Verified or guest |
| `/v/:violationRef/pay/gcash/confirm` | Step 3 (confirm) | Verified or guest |
| `/payments/:attemptId/success` | Payment Successful | Verified or guest |
| `/receipts/:reference` | Receipt | Verified or guest |

## Profile screens

- **Profile Information / Edit Profile** save the owner's details to their
  profile document. The email isn't editable here, and
  **Change Password** sends a Firebase reset email.
- **Payment Settings** keeps saved GCash numbers (`wallets`) that pre-fill
  Pay Now step 2. They're only numbers, never credentials.
- **Privacy** reads the browser's real camera permission and lists what MTPB
  keeps.
- **Help & Support** shows MTPB's contact details. They're placeholders in
  `src/data/contact.js` until the real ones are confirmed.

## Evidence photos

Violation Details shows the enforcer's photos as a strip that opens full
screen, read from the violation's `evidencePhotos` (`[url, ...]` or
`[{ url, caption }]`). The section is hidden when there are none.

## Maps

`src/components/LocationMap.jsx` is a reusable map: pass a center point and
markers. The office location is in `src/data/places.js`. OpenStreetMap's free
tiles are fine for development and the defense; a public launch should use a
tile provider with its own key.

## Still to do

- Real MTPB support email, phone and office hours in `src/data/contact.js`,
  and confirm the office location in `src/data/places.js`.
- Confirm the evidence-photo field names against the enforcer app.
- `/v/<code>` opens a violation without the QR token. Violation codes run in
  order, so decide with the admin side whether to restrict it.

## Project layout

```
src/
  auth/            AuthProvider (Firebase + demo), route guards
  components/      PageHeader, BottomNav, StatusBadge, LocationMap, ...
  data/            Sample data (demo mode), FAQs, places, contact details
  firebase/        config, schema (collection names), mapping (the admin
                   app's field names), clamps, violations, vehicles, auth
  hooks/           useViolation, useClamp, usePayments, ...
  payments/        index.js (what screens call), fees.js, sandbox.js (demo)
  pages/           One file per screen (pages/pay/ = payment flow)
  utils/           Peso and date formatting
api/               Vercel functions: create-checkout, confirm-payment, paymongo-webhook
server/            Backend logic (PayMongo client, Firestore adapter) + tests
scripts/           inspect-schema.mjs: read-only dump of the Firestore structure
vercel.json        Vercel settings (SPA routing)
```
