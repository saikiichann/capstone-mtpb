import { auth } from './firebase/config'

// Calls the app's own server (the api/ folder on Vercel) as the signed-in
// person, guests included. Used for payments and for reading violations and
// clamps, which the app no longer reads from the database itself.

// Leave empty when the app and api/ are deployed together on Vercel.
// Set it (e.g. https://your-app.vercel.app) to use the deployed API while
// running the app on localhost.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

export async function callApi(name, body) {
  const token = await auth.currentUser?.getIdToken()
  let res
  try {
    res = await fetch(`${API_BASE}/api/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('No internet connection. Check your connection and try again.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // A crashed function returns an HTML error page, so `data.error` is
    // empty. Showing the status code at least says which end broke.
    throw new ApiError(data.error || `Something went wrong (${res.status}). Please try again.`, res.status, data)
  }
  return data
}
