/* ------------------------------------------------------------------
   STAFF FORGOT PASSWORD

   Staff log in as <username>@mtpb.gov.ph — not a real mailbox — so the
   usual Firebase reset email can't reach anyone. Instead (server side:
   violator-pwa/server/staff-password.js, on the project's Vercel server,
   which has the Firebase Admin SDK):

     1. Login page "Forgot password?" → requestPasswordReset(username).
        The IT Admin sees the request in User Management.
     2. IT Admin → resetStaffPassword(uid) → a temporary password, given to
        the person directly. Their other sessions are signed out, and they
        must set a new password at the next login.

   The server address can be changed with VITE_STAFF_API_URL. The admin
   dashboard's address must be in the server's ALLOWED_ORIGINS.
------------------------------------------------------------------ */
import { auth } from "../firebase";

export const STAFF_PASSWORD_API =
  (import.meta.env.VITE_STAFF_API_URL as string | undefined) ??
  "https://mtpb-violators-pwa.vercel.app/api/staff-password";

const post = async (body: object, token?: string): Promise<Record<string, unknown>> => {
  let response: Response;
  try {
    response = await fetch(STAFF_PASSWORD_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server. Check your internet connection and try again.");
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(data.error ?? "Something went wrong. Please try again."));
  }
  return data;
};

/** Always resolves with the same message (it never says if the username exists). */
export const requestPasswordReset = async (username: string): Promise<string> => {
  const data = await post({ action: "request", username: username.trim().toLowerCase() });
  return String(
    data.message ??
      "If that username belongs to an active MTPB account, the IT Admin has been notified."
  );
};

/** IT Admin only. Returns the temporary password to give to the person. */
export const resetStaffPassword = async (
  uid: string
): Promise<{ temporaryPassword: string; username: string }> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Please log in again.");
  const token = await user.getIdToken();
  const data = await post({ action: "reset", uid }, token);
  return {
    temporaryPassword: String(data.temporaryPassword ?? ""),
    username: String(data.username ?? ""),
  };
};
