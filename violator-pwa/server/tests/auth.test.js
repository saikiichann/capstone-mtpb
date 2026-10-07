// Run with: npm run test:server
// Checks who the API lets pay: verified owners and guests (anonymous
// sign-in, used by someone who just scanned the clamp's QR code).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const { requireUser } = await import('../http.js')

// Stands in for the Firebase Admin auth object.
function fakeAuth(tokens) {
  return {
    verifyIdToken: async (token) => {
      if (!(token in tokens)) throw new Error('invalid token')
      return tokens[token]
    },
  }
}

const request = (token) =>
  new Request('https://app.example/api/create-checkout', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

describe('requireUser', () => {
  const auth = fakeAuth({
    owner: { uid: 'owner-1', email_verified: true, firebase: { sign_in_provider: 'password' } },
    unverified: { uid: 'owner-2', email_verified: false, firebase: { sign_in_provider: 'password' } },
    guest: { uid: 'guest-1', firebase: { sign_in_provider: 'anonymous' } },
  })

  it('accepts a verified owner', async () => {
    const user = await requireUser(request('owner'), auth)
    assert.equal(user.uid, 'owner-1')
    assert.equal(user.isGuest, false)
  })

  it('accepts a guest (anonymous sign-in)', async () => {
    const user = await requireUser(request('guest'), auth)
    assert.equal(user.uid, 'guest-1')
    assert.equal(user.isGuest, true)
  })

  it('refuses an account whose email is not verified', async () => {
    await assert.rejects(() => requireUser(request('unverified'), auth), (err) => {
      assert.equal(err.status, 403)
      assert.match(err.message, /Verify your email/)
      return true
    })
  })

  it('refuses a missing or invalid token', async () => {
    await assert.rejects(() => requireUser(request(), auth), (err) => {
      assert.equal(err.status, 401)
      return true
    })
    await assert.rejects(() => requireUser(request('nope'), auth), (err) => {
      assert.equal(err.status, 401)
      return true
    })
  })
})
