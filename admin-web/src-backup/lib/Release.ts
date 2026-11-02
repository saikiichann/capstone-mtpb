import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
export type QueueStatus =
  | "Ready for release"
  | "Awaiting for verification"
  | "In queue";

export type QueueRow = {
  id: string;
  position: number;
  queue: string;
  cin: string;
  plateNo: string;
  vehicleType: string;
  location: string;
  clampId: string | null;
  waitingMinutes: number;
  status: QueueStatus;
  canRelease: boolean;
  verifiedAt: Timestamp | null;
  totalPaid: number;
};

/** Payment states that belong in the release queue. */
export const QUEUE_PAYMENT_STATUSES = ["Pending Verification", "Verified"];

/**
 * Ang tanging release state na pinapapasok sa release queue.
 */
export const RELEASE_QUEUE_STATUS = "Approved by OIC";

/** Naghihintay ng aksyon ng OIC. */
export const AWAITING_OIC_STATUS = "Awaiting OIC Approval";

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

export const queueSortKey = (data: DocumentData): Timestamp | null =>
  (data.verifiedAt as Timestamp | undefined) ??
  (data.paidAt as Timestamp | undefined) ??
  (data.recordedAt as Timestamp | undefined) ??
  null;

export const computeWaitingMinutes = (ts: Timestamp | null): number => {
  if (!ts) return 0;
  try {
    const diffMs = new Date().getTime() - ts.toDate().getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  } catch {
    return 0;
  }
};

export const deriveQueueStatus = (data: DocumentData): QueueStatus => {
  if (data.paymentStatus !== "Verified") return "Awaiting for verification";
  if (data.releaseStatus === RELEASE_QUEUE_STATUS) return "Ready for release";
  return "In queue";
};

export const getQueueStatusClass = (status: QueueStatus): string => {
  const map: Record<QueueStatus, string> = {
    "Ready for release": "status-ready",
    "Awaiting for verification": "status-awaiting",
    "In queue": "status-inqueue",
  };
  return map[status] ?? "";
};

export const isOpenForRelease = (data: DocumentData): boolean =>
  data.releaseStatus === RELEASE_QUEUE_STATUS;

export const buildQueue = (
  docs: QueryDocumentSnapshot<DocumentData>[]
): QueueRow[] => {
  const millis = (ts: Timestamp | null) => {
    try {
      return ts ? ts.toMillis() : Number.MAX_SAFE_INTEGER;
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  };

  return docs
    .filter((d) => isOpenForRelease(d.data()))
    .sort(
      (a, b) => millis(queueSortKey(a.data())) - millis(queueSortKey(b.data()))
    )
    .map((d, index) => {
      const data = d.data();
      const sortKey = queueSortKey(data);
      const status = deriveQueueStatus(data);
      return {
        id: d.id,
        position: index + 1,
        queue: `Q-${String(index + 1).padStart(3, "0")}`,
        cin: data.cin ?? "—",
        plateNo: data.plateNo ?? "—",
        vehicleType: data.vehicleType ?? "—",
        location: data.location ?? "—",
        clampId: data.clampId ?? null,
        waitingMinutes: computeWaitingMinutes(sortKey),
        status,
        canRelease: data.paymentStatus === "Verified",
        verifiedAt: (data.verifiedAt as Timestamp | undefined) ?? null,
        totalPaid: Number(data.totalPaid ?? data.fineAmount ?? 0),
      };
    });
};

// ---------------------------------------------------------------------------
// RELEASE
// ---------------------------------------------------------------------------

export const markViolationAsReleased = async (params: {
  violationId: string;
  cin: string;
  plateNo: string;
  location: string;
  clampId: string | null;
  verifiedAt: Timestamp | null;
  officerName: string;
  totalPaid: number;
}): Promise<string> => {
  const violationRef = doc(db, "violations", params.violationId);
  const durationMinutes = computeWaitingMinutes(params.verifiedAt);
  const orderCounterRef = doc(db, "counters", "releaseOrder");
  const releaseLogRef = doc(collection(db, "releaseLog"));
  const auditRef = doc(collection(db, "auditLogs"));

  let clampRef: ReturnType<typeof doc> | null = null;
  if (params.clampId) {
    const clampSnap = await getDocs(
      query(collection(db, "clamps"), where("clampId", "==", params.clampId))
    );
    if (clampSnap.empty) {
      console.warn(`Clamp ${params.clampId} not found; skipping clamp reset.`);
    } else {
      clampRef = clampSnap.docs[0].ref;
    }
  }

  const orderId = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(orderCounterRef);
    const last = counterSnap.exists()
      ? Number(counterSnap.data().lastValue ?? 0)
      : 0;
    const next = last + 1;
    const year = new Date().getFullYear();
    const newOrderId = `ORD-${year}-${String(next).padStart(5, "0")}`;

    tx.set(
      orderCounterRef,
      { lastValue: next, prefix: "ORD", updatedAt: serverTimestamp() },
      { merge: true }
    );

    // 1. Violation
    tx.update(violationRef, {
      releaseStatus: "Released",
      releaseOrderId: newOrderId,
      releasedAt: serverTimestamp(),
      releasedBy: params.officerName,
      releaseDurationMinutes: durationMinutes,
      updatedAt: serverTimestamp(),
      updatedBy: params.officerName,
    });

    // 2. Clamp
    if (clampRef) {
      tx.update(clampRef, {
        status: "available",
        cin: null,
        currentViolationId: null,
        deployedAt: null,
        deployedBy: null,
        paidAt: null,
        readyAt: null,
        releasedAt: null,
        lastReleasedAt: serverTimestamp(),
        lastReleasedBy: params.officerName,
        lastReleasedCin: params.cin,
      });
    }

    // 3. Release log
    tx.set(releaseLogRef, {
      orderId: newOrderId,
      violationId: params.violationId,
      cin: params.cin,
      plateNo: params.plateNo,
      clampId: params.clampId,
      location: params.location,
      releasedBy: params.officerName,
      releaseDurationMinutes: durationMinutes,
      totalPaid: params.totalPaid,
      releasedAt: serverTimestamp(),
    });

    // 4. Audit log
    tx.set(auditRef, {
      userName: params.officerName,
      action: `released vehicle for ${params.cin} (${newOrderId}) and reset clamp to available`,
      record: params.cin,
      type: "release-queue",
      metadata: {
        cin: params.cin,
        plateNo: params.plateNo,
        location: params.location,
        clampId: params.clampId,
        orderId: newOrderId,
      },
      timestamp: serverTimestamp(),
    });

    return newOrderId;
  });

  return orderId;
};

// ---------------------------------------------------------------------------
// OIC RELEASE APPROVAL
// ---------------------------------------------------------------------------

export const decideReleaseRequest = async (params: {
  violationId: string;
  cin: string;
  plateNo: string;
  clampId?: string | null;
  approve: boolean;
  reason?: string;
  officerName: string;
}): Promise<void> => {
  const batch = writeBatch(db);
  const violationRef = doc(db, "violations", params.violationId);

  if (params.approve) {
    batch.update(violationRef, {
      releaseStatus: RELEASE_QUEUE_STATUS,
      oicApprovedAt: serverTimestamp(),
      oicApprovedBy: params.officerName,
      updatedAt: serverTimestamp(),
      updatedBy: params.officerName,
    });

    if (params.clampId) {
      const clampSnap = await getDocs(
        query(collection(db, "clamps"), where("clampId", "==", params.clampId))
      );

      if (clampSnap.empty) {
        console.warn(
          `Clamp ${params.clampId} not found; skipping ready-for-release update.`
        );
      } else {
        batch.update(clampSnap.docs[0].ref, {
          status: "ready-for-release",
          readyAt: serverTimestamp(),
        });
      }
    }
  } else {
    batch.update(violationRef, {
      releaseStatus: "Rejected by OIC",
      oicRejectedAt: serverTimestamp(),
      oicRejectedBy: params.officerName,
      oicRejectionReason: params.reason ?? null,
      updatedAt: serverTimestamp(),
      updatedBy: params.officerName,
    });
  }

  batch.set(doc(collection(db, "auditLogs")), {
    userName: params.officerName,
    action: `${params.approve ? "approved" : "rejected"} release for ${
      params.cin
    }`,
    record: params.cin,
    type: "release-request",
    metadata: {
      cin: params.cin,
      plateNo: params.plateNo,
      decision: params.approve ? "Approved by OIC" : "Rejected by OIC",
      ...(params.reason ? { reason: params.reason } : {}),
    },
    timestamp: serverTimestamp(),
  });

  await batch.commit();
};