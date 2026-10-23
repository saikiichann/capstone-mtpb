// Run with: npm run test:server
// Forgot password for MTPB staff accounts (admin dashboard): requests never
// reveal whether a username exists, and only an active IT Admin can reset.
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

const { createStaffPassword, GENERIC_REQUEST_REPLY, temporaryPassword, requireStaffToken } = await import(
  '../staff-password.js'
)
const { HttpError } = await import('../payments-service.js')

function memoryStore() {
  const users = new Map([
    ['it1', { name: 'Ira Admin', username: 'ira', role: 'it-admin', status: 'active' }],
    ['it2', { name: 'Old Admin', username: 'old', role: 'it-admin', status: 'inactive' }],
    ['fin1', { name: 'Ana Cruz', username: 'ana.cruz', role: 'finance', status: 'active' }],
    ['sus1', { name: 'Sus Pended', username: 'sus', role: 'oic', status: 'suspended' }],
  ])
  const requests = []
  const audit = []
  return {
    users,
    requests,
    audit,
    async findStaffByUsername(username) {
      for (const [uid, u] of users) if (u.username === username) return { uid, ...u }
      return null
    },
    async getStaff(uid) {
      return users.has(uid) ? { uid, ...users.get(uid) } : null
    },
    async hasPendingRequest(uid) {
      return requests.some((r) => r.uid === uid && r.status === 'pending')
    },
    async createRequest(data) {
      requests.push({ ...data })
    },
    async markPasswordReset(uid, { by }) {
      Object.assign(users.get(uid), { mustChangePassword: true, passwordResetBy: by })
    },
    async resolveRequests(uid, { by }) {
      requests.filter((r) => r.uid === uid && r.status === 'pending').forEach((r) => Object.assign(r, { status: 'done', resolvedBy: by }))
    },
    async writeAuditLog(entry) {
      audit.push(entry)
    },
  }
}

function fakeAuth() {
  const calls = []
  return {
    calls,
    async updateUser(uid, data) {
      calls.push(['updateUser', uid, data])
    },
    async revokeRefreshTokens(uid) {
      calls.push(['revoke', uid])
    },
    async verifyIdToken(token) {
      if (token === 'good-it') return { uid: 'it1', firebase: { sign_in_provider: 'password' } }
      if (token === 'guest') return { uid: 'anon', firebase: { sign_in_provider: 'anonymous' } }
      throw new Error('bad token')
    },
  }
}

describe('staff password: request', () => {
  let store, service
  beforeEach(() => {
    store = memoryStore()
    service = createStaffPassword({ store, auth: fakeAuth() })
  })

  it('makes one pending request for an active account', async () => {
    assert.deepEqual(await service.request({ username: 'Ana.Cruz ' }), GENERIC_REQUEST_REPLY)
    await service.request({ username: 'ana.cruz' })
    assert.equal(store.requests.length, 1)
    assert.deepEqual(
      { uid: store.requests[0].uid, username: store.requests[0].username, status: store.requests[0].status },
      { uid: 'fin1', username: 'ana.cruz', status: 'pending' }
    )
  })

  it('answers the same for unknown, inactive or malformed usernames, without a request', async () => {
    for (const username of ['nobody', 'sus', '', 'a', 'bad name!', null, '../x']) {
      assert.deepEqual(await service.request({ username }), GENERIC_REQUEST_REPLY)
    }
    assert.equal(store.requests.length, 0)
  })
})

describe('staff password: reset', () => {
  let store, auth, service
  beforeEach(() => {
    store = memoryStore()
    auth = fakeAuth()
    service = createStaffPassword({ store, auth })
  })

  it('lets an active IT Admin reset another account', async () => {
    await service.request({ username: 'ana.cruz' })
    const result = await service.reset({ caller: { uid: 'it1' }, uid: 'fin1' })
    assert.equal(result.username, 'ana.cruz')
    assert.match(result.temporaryPassword, /^[A-Za-z2-9]{10}$/)
    assert.deepEqual(auth.calls[0], ['updateUser', 'fin1', { password: result.temporaryPassword }])
    assert.deepEqual(auth.calls[1], ['revoke', 'fin1'])
    assert.equal(store.users.get('fin1').mustChangePassword, true)
    assert.equal(store.requests[0].status, 'done')
    assert.equal(store.audit[0].type, 'password-reset')
    assert.ok(!JSON.stringify(store.audit).includes(result.temporaryPassword), 'password never logged')
  })

  it('refuses non-IT-Admins, inactive IT Admins, self-resets and unknown accounts', async () => {
    const refuse = async (args, status) =>
      assert.rejects(service.reset(args), (err) => err instanceof HttpError && err.status === status)
    await refuse({ caller: { uid: 'fin1' }, uid: 'it1' }, 403)
    await refuse({ caller: { uid: 'it2' }, uid: 'fin1' }, 403)
    await refuse({ caller: undefined, uid: 'fin1' }, 403)
    await refuse({ caller: { uid: 'it1' }, uid: 'it1' }, 400)
    await refuse({ caller: { uid: 'it1' }, uid: '' }, 400)
    await refuse({ caller: { uid: 'it1' }, uid: 'ghost' }, 404)
    assert.equal(auth.calls.length, 0)
  })
})

describe('staff password: helpers', () => {
  it('temporary passwords mix letters and digits and avoid look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const p = temporaryPassword()
      assert.match(p, /[2-9]/)
      assert.match(p, /[A-Za-z]/)
      assert.doesNotMatch(p, /[01OIl]/)
    }
  })

  it('needs a non-guest token', async () => {
    const auth = fakeAuth()
    const req = (token) => new Request('https://x/api', { headers: token ? { authorization: `Bearer ${token}` } : {} })
    assert.equal((await requireStaffToken(req('good-it'), auth)).uid, 'it1')
    await assert.rejects(requireStaffToken(req(null), auth), { status: 401 })
    await assert.rejects(requireStaffToken(req('nope'), auth), { status: 401 })
    await assert.rejects(requireStaffToken(req('guest'), auth), { status: 403 })
  })
})
