import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";

/**
 * Logs a PII access event to the `privacyLogs` collection.
 *
 * Should be called every time a user:
 *  - Views a sensitive record (e.g., owner profile, violation record)
 *  - Creates a new PII record
 *  - Updates an existing PII record
 *  - Deletes a PII record
 *
 * Compliance: Data Privacy Act of 2012 (R.A. 10173)
 */
export type PrivacyAction = "Viewed" | "Created" | "Updated" | "Deleted";

export type PrivacyRecordType =
  | "Vehicle owner profile"
  | "Violation record"
  | "Violation record + photo"
  | "Impound record"
  | "Release record"
  | "Payment record"
  | string;

export interface PrivacyLogParams {
  action: PrivacyAction;
  recordType: PrivacyRecordType;
  recordId: string;
  userId?: string;
  userName?: string;
}

export async function logPrivacyAccess({
  action,
  recordType,
  recordId,
  userId,
  userName,
}: PrivacyLogParams): Promise<void> {
  try {
    // Get the current user from Firebase Auth
    const currentUser = auth.currentUser;

    let finalUserId = userId ?? "";
    let finalUserName = userName ?? "";

    if (!finalUserId && currentUser) {
      finalUserId = currentUser.uid;
      finalUserName =
        currentUser.displayName ||
        currentUser.email?.split("@")[0] ||
        "unknown";
    }

    await addDoc(collection(db, "privacyLogs"), {
      userId: finalUserId,
      userName: finalUserName,
      action,
      recordType,
      recordId,
      timestamp: serverTimestamp(),
    });

    console.log(`[Privacy Log] ${action} — ${recordType} — ${recordId}`);
  } catch (err) {
    
    console.error("[Privacy Log] Failed to log privacy access:", err);
  }
}