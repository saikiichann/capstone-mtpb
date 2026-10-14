/**
 * Notification Service
 *
 * Centralized notification management for the MTPB Integrated Enforcement
 * System. Handles creation, delivery, and read-state management of in-app
 * notifications across all user roles.
 *
 * @module lib/notifications
 */

import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

/* ---------------------------------------------------------------------------
   TYPE DEFINITIONS
--------------------------------------------------------------------------- */

/**
 * Supported notification categories. Used for client-side filtering,
 * icon selection, and deep-linking behavior.
 */
export type NotificationType =
  | "release-approved"
  | "release-rejected"
  | "release-request"
  | "payment-verified"
  | "impound-approved"
  | "general";

/**
 * Payload contract for creating a single notification document.
 */
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

/**
 * Parameters for notifying all release officers of an OIC approval.
 */
export interface ReleaseApprovalParams {
  cin: string;
  plateNo: string;
  violationId: string;
  approvedBy: string;
  location?: string;
}

/**
 * Parameters for notifying all release officers of an OIC rejection.
 */
export interface ReleaseRejectionParams {
  cin: string;
  plateNo: string;
  violationId: string;
  rejectedBy: string;
  reason?: string;
}

/**
 * Parameters for notifying OIC of a new release request.
 */
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
 * Uses a single batch write to minimize round-trips and ensure atomicity.
 * If no active users match the role, returns 0 without throwing.
 *
 * @param role    - The target role slug (e.g., "release-officer").
 * @param payload - The notification content (without recipient fields).
 * @returns The number of notification documents created.
 */
export async function notifyAllWithRole(
  role: string,
  payload: Omit<NotificationPayload, "recipientUid" | "recipientRole">
): Promise<number> {
  const usersSnapshot = await getDocs(
    query(
      collection(db, "users"),
      where("role", "==", role),
      where("status", "==", "active")
    )
  );

  if (usersSnapshot.empty) {
    console.warn(`No active users found with role: ${role}`);
    return 0;
  }

  const batch = writeBatch(db);
  let count = 0;

  usersSnapshot.docs.forEach((userDoc) => {
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
  return notifyAllWithRole("release-officer", {
    title: "New Vehicle Ready for Release",
    message: `${params.cin} (${params.plateNo}) has been approved by ${params.approvedBy}. Ready for release.`,
    type: "release-approved",
    link: "/release-officer/queue",
    metadata: {
      violationId: params.violationId,
      cin: params.cin,
      plateNo: params.plateNo,
      approvedBy: params.approvedBy,
      location: params.location ?? null,
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