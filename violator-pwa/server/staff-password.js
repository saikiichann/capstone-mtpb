import { randomInt } from 'node:crypto'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpError } from './payments-service.js'

// Forgot password for MTPB STAFF accounts (the admin dashboard, Mira's app).
// Not used by the violator app itself — it only lives here because this is
// the project's server with the Firebase Admin SDK.
//
// Staff log in as <username>@mtpb.gov.ph, which isn't a real mailbox, so the
// usual Firebase reset email can't reach anyone. Instead:
//   1. request — the login page's "Forgot password?" sends the username.
//      If it's an active staff account, a `passwordResetRequests` entry is
//      made for the IT Admin. The answer is the same either way, so nobody
//      can use this to find out which usernames exist.
//   2. reset   — the IT Admin (signed in) resets the password from User
//      Management. A temporary password is made here, the account's other
//      sessions are signed out, and the user must change it at next login
//      (`mustChangePassword`). The IT Admin gives it to the person directly.
//
// `store` is createStaffStore() below; `auth` the Firebase Admin auth. Tests
// pass fakes.

export const USERNAME_PATTERN = /^[a-z0-9.]{3,40}$/

// No look-alike characters (0/O, 1/l/I), so it can be read out or written down.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'
const DIGITS = '23456789'

export function temporaryPassword(length = 10) {
  const all = LETTERS + DIGITS
  const chars = Array.from({ length }, () => all[randomInt(all.length)])
  // At least one letter and one digit.
  chars[randomInt(length)] = DIGITS[randomInt(DIGITS.length)]
  let i = randomInt(length)
  while (DIGITS.includes(chars[i])) i = (i + 1) % length
  chars[i] = LETTERS[randomInt(LETTERS.length)]
  return chars.join('')
}

export const GENERIC_REQUEST_REPLY = {
  ok: true,
  message:
    'If that username belongs to an active MTPB account, the IT Admin has been notified. They will give you a temporary password.',
}

export function createStaffPassword({ store, auth, now = () => new Date() }) {
  async function request({ username }) {
    const name = String(username ?? '').trim().toLowerCase()
    if (!USERNAME_PATTERN.test(name)) return GENERIC_REQUEST_REPLY

    const user = await store.findStaffByUsername(name)
    if (!user || String(user.status ?? '').toLowerCase() !== 'active') return GENERIC_REQUEST_REPLY

    // One open request per account is enough.
    if (!(await store.hasPendingRequest(user.uid))) {
      await store.createRequest({
        uid: user.uid,
        username: name,
        name: user.name ?? name,
        role: user.role ?? '',
        status: 'pending',
        requestedAt: now(),
      })
    }
    return GENERIC_REQUEST_REPLY
  }

  async function reset({ caller, uid }) {
    const admin = await store.getStaff(caller?.uid)
    if (!admin || admin.role !== 'it-admin' || String(admin.status ?? '').toLowerCase() !== 'active') {
      throw new HttpError(403, 'Only the IT Admin can reset passwords.')
    }
    if (typeof uid !== 'string' || !uid.trim()) throw new HttpError(400, 'Choose an account to reset.')
    if (uid === caller.uid) throw new HttpError(400, 'Use Change Password for your own account.')

    const target = await store.getStaff(uid)
    if (!target) throw new HttpError(404, 'That account no longer exists.')

    const password = temporaryPassword()
    await auth.updateUser(uid, { password })
    // Signs the account out everywhere (a lost or shared device).
    await auth.revokeRefreshTokens(uid)

    const at = now()
    await store.markPasswordReset(uid, { by: admin.name ?? 'IT Admin', at })
    await store.resolveRequests(uid, { by: admin.name ?? 'IT Admin', at })
    await store.writeAuditLog({
      userName: admin.name ?? 'IT Admin',
      userRole: 'it-admin',
      userId: caller.uid,
      action: `reset the password of ${target.username ?? uid} (${target.role ?? 'staff'})`,
      record: target.username ?? uid,
      type: 'password-reset',
      metadata: { targetUid: uid },
      timestamp: at,
    })

    return { temporaryPassword: password, username: target.username ?? '' }
  }

  return { request, reset }
}

// Verifies the staff member's Firebase ID token. Staff emails are not real
// mailboxes, so (unlike requireUser) an unverified email is fine; guests
// (anonymous) are not.
export async function requireStaffToken(request, auth) {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new HttpError(401, 'Please log in again.')
  let decoded
  try {
    decoded = await auth.verifyIdToken(token)
  } catch {
    throw new HttpError(401, 'Your session expired. Please log in again.')
  }
  if (decoded.firebase?.sign_in_provider === 'anonymous') throw new HttpError(403, 'Not allowed.')
  return decoded
}

// Firestore side, with the Admin SDK (the rules don't let browsers write
// `passwordResetRequests`).
export function createStaffStore(app) {
  const db = getFirestore(app)
  const users = db.collection('users')
  const requests = db.collection('passwordResetRequests')

  return {
    async findStaffByUsername(username) {
      const snap = await users.where('username', '==', username).limit(1).get()
      if (snap.empty) return null
      return { uid: snap.docs[0].id, ...snap.docs[0].data() }
    },
    async getStaff(uid) {
      if (!uid) return null
      const doc = await users.doc(uid).get()
      return doc.exists ? { uid: doc.id, ...doc.data() } : null
    },
    async hasPendingRequest(uid) {
      const snap = await requests.where('uid', '==', uid).where('status', '==', 'pending').limit(1).get()
      return !snap.empty
    },
    async createRequest(data) {
      await requests.add({ ...data, requestedAt: FieldValue.serverTimestamp() })
    },
    async markPasswordReset(uid, { by }) {
      await users.doc(uid).update({
        mustChangePassword: true,
        passwordResetAt: FieldValue.serverTimestamp(),
        passwordResetBy: by,
      })
    },
    async resolveRequests(uid, { by }) {
      const snap = await requests.where('uid', '==', uid).where('status', '==', 'pending').get()
      if (snap.empty) return
      const batch = db.batch()
      snap.docs.forEach((doc) =>
        batch.update(doc.ref, { status: 'done', resolvedBy: by, resolvedAt: FieldValue.serverTimestamp() })
      )
      await batch.commit()
    },
    async writeAuditLog(entry) {
      await db.collection('auditLogs').add({ ...entry, timestamp: FieldValue.serverTimestamp() })
    },
  }
}
