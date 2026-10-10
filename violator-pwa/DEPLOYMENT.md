# Deployment checklist — violator PWA

The live setup as of 2026-10-10, and what to check whenever something about hosting changes (new domain, new
Vercel project, new Firebase project, rotated keys). README's "Deploying" section explains each step; this file is
the checklist. **Never paste secret values into this file**: names only.

## Where it runs

| What | Value |
|---|---|
| Repo | `saikiichann/capstone-mtpb`, folder `violator-pwa/` |
| Vercel team / project | **MTPB** / `mtpb-violator-pwa` (owner: Mira) |
| Root Directory | `violator-pwa` |
| Production domain | `mtpb-violators-pwa.vercel.app` |
| Other domain | `mtpb-violator-pwa.vercel.app` (Vercel's default) |
| Firebase project | `mtpb-integrated-enforcem-9e6f8` (owner: Mira) |
| PayMongo | test mode only, GCash only |

Vercel setting: "Skip deployments when there are no changes to the root directory" is **on**, so commits that
only touch `admin-web/` or the enforcer app don't redeploy this app.

## 1. Vercel environment variables

Client (`VITE_…`, from `.env.example`). Tick **Production and Preview** for each. If Preview is left unticked,
preview builds silently run on sample data.

- [ ] `VITE_FIREBASE_API_KEY`
- [ ] `VITE_FIREBASE_AUTH_DOMAIN`: `<project-id>.firebaseapp.com`
- [ ] `VITE_FIREBASE_PROJECT_ID`: `mtpb-integrated-enforcem-9e6f8`
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`: digits only
- [ ] `VITE_FIREBASE_APP_ID`
- [ ] `VITE_PAYMENTS_MODE=paymongo`

Server (from `.env.server.example`), Production only:

- [ ] `PAYMONGO_SECRET_KEY` (`sk_test_…`, **never** `sk_live_…`)
- [ ] `PAYMONGO_WEBHOOK_SECRET` (`whsk_…`, from step 3)
- [ ] `FIREBASE_SERVICE_ACCOUNT` (the whole JSON key, as one value)
- [ ] `APP_URL`: `https://mtpb-violators-pwa.vercel.app`
- [ ] `ALLOWED_ORIGINS`: the same URL (comma-separate if there are more)
- [ ] `GMAIL_USER`: `mtpb.violatorportal@gmail.com` (sends the MTPB receipt email; optional)
- [ ] `GMAIL_APP_PASSWORD`: an **app password** for that Gmail (Google Account → Security → 2-Step
  Verification on → App passwords), marked Sensitive. Without these two, payments still work and no email is
  sent.

**Check the values, not just the names.** Once, `AUTH_DOMAIN` and `PROJECT_ID` were saved with their own names
as values and logins hung on "Logging in…". `VITE_…` values are built into the app, so **redeploy after changing
any of them**.

## 2. Firebase

- [ ] **Authentication → Sign-in method**: Email/Password **and** Anonymous enabled (guests use Anonymous).
- [ ] **Authentication → Settings → Authorized domains**: the production domain is listed.
  Without it, sign-up shows "This website address is not in the Firebase project's authorized domains" and no
  verification email is sent (happened 2026-10-10).
- [ ] Rules are Mira's (see `firestore-rules-review.md` outside the repo). This repo ships none.

## 3. PayMongo

- [ ] **Developers → Webhooks**: endpoint `https://mtpb-violators-pwa.vercel.app/api/paymongo-webhook`,
  event `checkout_session.payment.paid`, status enabled.
- [ ] Its secret is in Vercel as `PAYMONGO_WEBHOOK_SECRET`, then redeploy.
- [ ] If the domain changes, **update the webhook URL**. Payments still go through without it (the success
  page asks the backend to check), but anyone who closes the page early won't get their payment recorded.

## 4. After every deploy (2 minutes, on a phone)

- [ ] Open the production URL. If the old version shows, the app offers **Refresh** (or close and reopen it).
- [ ] Log in with a real account: Home shows vehicles (not the sample ones).
- [ ] History → Payment History → open a receipt → back returns to Payment History.
- [ ] Scan a clamp QR (or open `/scan?t=<token>`): Violation Details loads.
- [ ] Sign up with a new email: the verification email arrives (check spam).
- [ ] Optional: pay a test violation with GCash test mode and confirm it reaches Mira's Payment Verification.

## 5. When something breaks

- **Vercel → Deployments → the deployment → Logs**: errors from `/api/…` functions.
- **PayMongo → Developers → Webhooks → the endpoint**: each delivery and its response.
- **Browser DevTools → Application → Service workers**: which build the phone is running.
- Roll back: **Vercel → Deployments → an older Ready deployment → Promote to Production**.

## Checks on every pull request

GitHub runs `.github/workflows/violator-pwa.yml` (lint, tests, build) on pull requests that change `violator-pwa/`.
Locally, the same:

```
npx oxlint src server api
npm test
npm run build
```
