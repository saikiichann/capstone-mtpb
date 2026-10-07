# MTPB: what the three apps share

The **admin app** (Mira, `admin-web/`, React + TypeScript) owns the Firebase
project and its data. The **enforcer app** (Ian, React Native) records
violations in the field. This app, the **violator PWA** (Marco), adapts to the
admin app: it reads what the other two write, and writes only what the admin
app itself would write, in its format.

Shared project: **`mtpb-integrated-enforcem-9e6f8`**.

Field names below are the admin app's. Where this app wants other names, it
translates on the way in: `src/firebase/mapping.js` is the only file to edit
if a name changes. `node scripts/inspect-schema.mjs` (read-only) prints the
live structure.

Security rules belong to the admin app and are managed there.

## 1. `violations`

Written by the enforcer side (for now, by hand or the admin app).

| Field | Type | Notes |
| --- | --- | --- |
| `cin` | string | e.g. `CLM-2026-0055`, `IMP-2026-0056` |
| `clampId` | string | The number stamped on the clamp, e.g. `R-21` |
| `plateNo` | string | Capitals, single spaces: `ABD 1235` |
| `fineAmount` | number | Pesos. Sometimes stored as text; the app copes |
| `violationType`, `location`, `officer` | string | |
| `recordedAt` | timestamp | When the clamp went on |
| `enforcementType` | string | Clamping or impounding |
| `paymentStatus` | string | `Unpaid` → `Pending Verification` → `Verified` or `Rejected` |
| `paymentMethod`, `paymentReference`, `referenceNumber`, `totalPaid`, `paidAt` | — | Set when a payment is recorded |
| `verifiedBy`, `verifiedAt`, `rejectionReason`, `releaseStatus` | — | Set by the admin app |
| `evidencePhotos` | array | `[url, ...]` or `[{ url, caption }]`, Supabase URLs readable without an account |

What the violator sees: `Unpaid` → Pay Now. `Pending Verification` → "paid –
awaiting verification", no Pay Now. `Verified` → paid. `Rejected` → payable
again, with `rejectionReason` shown.

## 2. `clamps`

Registered in the admin app's QR Management. Random document ids.

| Field | Type | Notes |
| --- | --- | --- |
| `clampId` | string | The number stamped on the clamp, `R-21` |
| `scanToken` | string | Random token in the QR link; IT can re-issue it |
| `cin`, `currentViolationId` | string | The violation live on this clamp |
| `deployedAt`, `paidAt`, `readyAt`, `releasedAt` | timestamp | The trail |
| `status` | string | Stored, but not trusted (see below) |

**QR sticker:** `https://mtpb-violators-pwa.vercel.app/scan?t=<scanToken>`.
This app finds clamps by `scanToken` only; a clamp number in the link finds
nothing.

**State:** like the admin app, this app derives it from the other fields:
`releasedAt` → released, `readyAt` → ready for release, `paidAt` → paid,
`deployedAt` / `cin` / `currentViolationId` → for payment, otherwise waiting.

Violations are attached to clamps with `issueViolationForClamp`
(`admin-web/src/lib/enforcement.ts`), meant for the enforcer app.

## 3. `payments` (admin app's collection)

Random document ids. The admin app writes cash payments; this app's backend
writes online payments once PayMongo confirms them, with the same fields:

| Field | Notes |
| --- | --- |
| `violationId`, `cin`, `plateNo` | The violation paid |
| `amount` | The fine |
| `convenienceFee`, `totalAmount` | Fee, and fine + fee |
| `referenceNumber` | `REF-<year>-<5 digits>` from `counters/paymentReference` |
| `method` | `Cash` or `GCash` |
| `status` | `pending` until finance staff verify it; then `verificationStatus` |
| `recordedBy`, `paidAt`, `createdAt` | |
| `uid`, `checkoutAttemptId`, `paymongoPaymentId`, `livemode` | Online payments only. Not used by the admin app: `uid` lets the violator find their receipts, the PayMongo ids let staff match the PayMongo dashboard, `livemode: false` marks test receipts |

In the same transaction the backend:

1. takes the next number from `counters/paymentReference` (`lastValue`), the
   counter the admin app's cash payments use, so numbers never clash
2. sets the violation to `Pending Verification` with `paymentMethod: "GCash"`,
   `paymentReference`, `referenceNumber`, `totalPaid`, `paidAt`

Verification, the clamp, release status and release belong to the admin app.

## 4. `checkoutAttempts` (this app's backend only)

One document per Pay Now press, paid or not, so abandoned checkouts never
reach the admin app's verification queue. Holds the PayMongo session, the
amounts, the contact number and email, and, once paid, the REF number. The
browser can't read it; the success page asks `/api/confirm-payment`.

## 5. Violator accounts

- Profiles live in `violators` (document id = Auth uid), beside the admin
  app's `users`. Saved GCash numbers are in a `wallets` array there.
- **Guests** pay after an anonymous sign-in. **Anonymous sign-in must be
  enabled** in the project. If a guest signs up later, the account links to
  the same uid.
- The app's domain must be under **Authentication → Settings → Authorized
  domains**.

## 6. `vehicles`

Read by this app: `ownerUid`, `plateNumber`, `verificationStatus`, and the
vehicle's details. Owners can't add or edit vehicles; they're attached by the
MTPB side.

## 7. Still to agree

- The evidence-photo field name, against the enforcer app.
- `/v/<cin>` in this app opens a violation without the QR token. CINs run in
  order, so decide whether to restrict it.
