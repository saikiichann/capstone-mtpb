/**
 * Notification Service
 *
 * Centralized notification management for the MTPB Integrated Enforcement
 * System. Handles creation, delivery, and read-state management of in-app
 * notifications across all user roles.
 *
 * Uses roleRegistry collection (instead of users collection) para sa
 * cross-user role queries — hindi ma-expose ang sensitive user info.
 *
 * roleRegistry structure: roleRegistry/{role}/users/{uid}
 *   - name: string
 *   - active: boolean
 *   - updatedAt: timestamp
 *
 * Naka-sync sa UserManagement page: kapag nag-create/edit/disable ng
 * user, sabay na naka-sync dito.
 *
 * @module lib/notifications
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { locationDetailsOf, placeLine, type LocationDetails } from "./locationDetails";

/* ---------------------------------------------------------------------------
   TYPE DEFINITIONS
--------------------------------------------------------------------------- */

export type NotificationType =
  | "release-approved"
  | "release-rejected"
  | "release-request"
  | "payment-verified"
  | "impound-approved"
  | "general";

export interface NotificationPayload {
  /** Firebase Auth UID of the notification recipient. */
  recipientUid: string;

  /** Optional role identifier for role-scoped notifications. */
  recipientRole?: string;

  /** Short headline displayed in the notification bell dropdown. */
  title: string;

  /** Full descriptive body of the notification. */
  message: string;

  /** Notification category for filtering and UI treatment. */
  type: NotificationType;

  /** Optional structured data for deep-linking and auditing. */
  metadata?: Record<string, unknown>;

  /** Optional in-app route to navigate to on click. */
  link?: string;
}

export interface ReleaseApprovalParams {
  cin: string;
  plateNo: string;
  violationId: string;
  approvedBy: string;
  location?: string;
}

export interface ReleaseRejectionParams {
  cin: string;
  plateNo: string;
  violationId: string;
  rejectedBy: string;
  reason?: string;
}

export interface ReleaseRequestParams {
  cin: string;
  plateNo: string;
  violationId: string;
  requestedBy: string;
}

/* ---------------------------------------------------------------------------
   CORE OPERATIONS
--------------------------------------------------------------------------- */

/**
 * Creates a single notification document for a specific user.
 *
 * @param payload - The notification content and recipient details.
 * @returns The generated notification document ID.
 */
export async function createNotification(
  payload: NotificationPayload
): Promise<string> {
  const docRef = await addDoc(collection(db, "notifications"), {
    recipientUid: payload.recipientUid,
    recipientRole: payload.recipientRole ?? null,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    metadata: payload.metadata ?? {},
    link: payload.link ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Creates notifications for every active user holding the specified role.
 *
 * ✅ BAGO: Ginagamit ang `roleRegistry/{role}/users` collection sa halip
 * na `users` collection. Ito ay lightweight directory (name + active flag
 * lang) na walang sensitive info, at pwede itong basahin ng kahit sinong
 * active user.
 *
 * @param role    - The target role slug (e.g., "release-officer").
 * @param payload - The notification content (without recipient fields).
 * @returns The number of notification documents created.
 */
export async function notifyAllWithRole(
  role: string,
  payload: Omit<NotificationPayload, "recipientUid" | "recipientRole">
): Promise<number> {
  // Query roleRegistry/{role}/users — dito naka-listahan ang lahat ng
  // active users na may ganitong role. Walang sensitive info (name +
  // active flag lang ang laman).
  const registrySnapshot = await getDocs(
    query(
      collection(db, "roleRegistry", role, "users"),
      where("active", "==", true)
    )
  );

  if (registrySnapshot.empty) {
    console.warn(`No active users found with role: ${role}`);
    return 0;
  }

  const batch = writeBatch(db);
  let count = 0;

  registrySnapshot.docs.forEach((userDoc) => {
    const notificationRef = doc(collection(db, "notifications"));
    batch.set(notificationRef, {
      recipientUid: userDoc.id,
      recipientRole: role,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      metadata: payload.metadata ?? {},
      link: payload.link ?? null,
      read: false,
      createdAt: serverTimestamp(),
    });
    count++;
  });

  await batch.commit();
  return count;
}

/**
 * Marks a single notification as read.
 *
 * @param notificationId - Firestore document ID of the notification.
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<void> {
  await updateDoc(doc(db, "notifications", notificationId), {
    read: true,
    readAt: serverTimestamp(),
  });
}

/**
 * Marks all unread notifications of a user as read in a single batch.
 *
 * @param recipientUid - Firebase Auth UID of the recipient.
 */
export async function markAllNotificationsAsRead(
  recipientUid: string
): Promise<void> {
  const snapshot = await getDocs(
    query(
      collection(db, "notifications"),
      where("recipientUid", "==", recipientUid),
      where("read", "==", false)
    )
  );

  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      read: true,
      readAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

/* ---------------------------------------------------------------------------
   DOMAIN-SPECIFIC NOTIFICATION HELPERS
--------------------------------------------------------------------------- */

/**
 * Notifies all active release officers that an OIC has approved a release.
 *
 * This is the primary trigger for the release-queue workflow: once an OIC
 * approves a request, every release officer receives a notification and
 * the vehicle appears in their real-time queue.
 *
 * @param params - Release approval details for the notification body.
 * @returns The number of notifications created.
 */
export async function notifyReleaseOfficersOfApproval(
  params: ReleaseApprovalParams
): Promise<number> {
  // Where the vehicle is: district, barangay, exact spot (lib/locationDetails.ts).
  let details: LocationDetails | null = null;
  try {
    const snap = await getDoc(doc(db, "violations", params.violationId));
    if (snap.exists()) details = locationDetailsOf(snap.data());
  } catch (err) {
    console.warn("Location for the notification not loaded:", err);
  }
  const place = details ? placeLine(details) : params.location ?? "";

  return notifyAllWithRole("release-officer", {
    title: details?.district
      ? `New Vehicle Ready for Release · ${details.district}`
      : "New Vehicle Ready for Release",
    message:
      `${params.cin} (${params.plateNo}) has been approved by ${params.approvedBy}. Ready for release.` +
      (place && place !== "—" ? ` Location: ${place}.` : ""),
    type: "release-approved",
    link: "/release-officer/queue",
    metadata: {
      violationId: params.violationId,
      cin: params.cin,
      plateNo: params.plateNo,
      approvedBy: params.approvedBy,
      location: params.location ?? null,
      district: details?.district ?? null,
      barangay: details?.barangay ?? null,
      exactLocation: details ? placeLine(details) : null,
      mapUrl: details?.mapUrl ?? null,
      approvedAt: new Date().toISOString(),
    },
  });
}

/**
 * Notifies all active release officers that an OIC has rejected a release.
 *
 * @param params - Release rejection details for the notification body.
 * @returns The number of notifications created.
 */
export async function notifyReleaseOfficersOfRejection(
  params: ReleaseRejectionParams
): Promise<number> {
  const reasonSuffix = params.reason ? ` Reason: ${params.reason}` : "";

  return notifyAllWithRole("release-officer", {
    title: "Release Request Rejected",
    message: `${params.cin} (${params.plateNo}) was rejected by ${params.rejectedBy}.${reasonSuffix}`,
    type: "release-rejected",
    link: "/release-officer/queue",
    metadata: {
      violationId: params.violationId,
      cin: params.cin,
      plateNo: params.plateNo,
      rejectedBy: params.rejectedBy,
      reason: params.reason ?? null,
      rejectedAt: new Date().toISOString(),
    },
  });
}

/**
 * Notifies all active OICs that a new release request requires approval.
 *
 * @param params - Release request details for the notification body.
 * @returns The number of notifications created.
 */
export async function notifyOicOfNewRequest(
  params: ReleaseRequestParams
): Promise<number> {
  return notifyAllWithRole("oic", {
    title: "New Release Request",
    message: `${params.cin} (${params.plateNo}) is awaiting your approval.`,
    type: "release-request",
    link: "/oic/release-requests",
    metadata: {
      violationId: params.violationId,
      cin: params.cin,
      plateNo: params.plateNo,
      requestedBy: params.requestedBy,
      requestedAt: new Date().toISOString(),
    },
  });
}