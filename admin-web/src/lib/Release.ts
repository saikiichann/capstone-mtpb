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
  /** FIFO position, 1-based. Derived from the sort order, not stored. */
  position: number;
  queue: string;
  cin: string;
  plateNo: string;
  vehicleType: string;
  location: string;
  clampId: string | null;
  waitingMinutes: number;
  status: QueueStatus;
  /** Only verified payments may be released. */
  canRelease: boolean;
  verifiedAt: Timestamp | null;
  /** Needed at release time so markViolationAsReleased can write it into
   *  the releaseLog entry — buildQueue() used to drop this field. */
  totalPaid: number;
};

/** Payment states that belong in the release queue. */
export const QUEUE_PAYMENT_STATUSES = ["Pending Verification", "Verified"];

/**
 * Ang tanging release state na pinapapasok sa release queue.
 *
 * Kailangan munang maaprubahan ng OIC bago makita ng Release Officer.
 * Dati, "Pending" at "Ready for Release" — lumalabas agad sa queue ang
 * kahit anong bayad na violation, nalalaktawan ang OIC.
 */
export const RELEASE_QUEUE_STATUS = "Approved by OIC";

/** Naghihintay ng aksyon ng OIC — ito ang laman ng Release Requests page. */
export const AWAITING_OIC_STATUS = "Awaiting OIC Approval";

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Ang FIFO sort key ay ang oras ng payment verification, ayon sa objective.
 *
 * May fallback chain kasi hindi lahat ng document ay may verifiedAt — mga
 * lumang record o manual seed. Kung orderBy() lang ang gagamitin sa Firestore,
 * tahimik na tinatanggal ang mga document na walang ganoong field, kaya hindi
 * sila lalabas sa queue. Client-side sort ang ginagamit dito para hindi
 * mawala ang kahit isang case.
 */
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

/**
 * Ngayong OIC-approved lang ang pumapasok sa queue, lahat ng nandito ay
 * verified na ang bayad at may go signal na. Kaya "Ready for release" ang
 * normal na estado. Nananatili ang dalawa pang values bilang safety net —
 * kung may makapasok na hindi dapat, halata agad sa UI.
 */
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

/** True kung naaprubahan na ng OIC at dapat nang nasa release queue. */
export const isOpenForRelease = (data: DocumentData): boolean =>
  data.releaseStatus === RELEASE_QUEUE_STATUS;

/**
 * Bumubuo ng FIFO-ordered queue mula sa raw snapshot docs.
 *
 * Pinakamatagal nang naghihintay ang nasa taas, base sa oras ng payment
 * verification. Ang position number ay derived sa order na ito, kaya
 * nagbabago siya habang umuusad ang queue — hindi ito permanenteng ID at
 * hindi dapat ipakita bilang reference number.
 */
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

  // Iisang sort tier lang: pinakamatagal nang naghihintay ang mauuna.
  // Dati, may hiwalay na tier para iunahin ang verified — hindi na
  // kailangan, kasi verified na lahat ng nakakapasok dito.
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

/**
 * Minamarkahan ang isang violation bilang released, sa isang atomic
 * transaction.
 *
 * Apat na bagay ang binabago: ang violation, ang clamp (balik sa
 * "available" para magamit ulit), ang release log (may bagong sequential
 * orderId dito ngayon), at ang audit log. Iisang transaction sila kaya
 * kung mabigo ang isa, walang masusulat sa lahat.
 *
 * Bakit runTransaction, hindi writeBatch gaya ng dati: kailangang
 * mabasa muna ang counters/releaseOrder document bago malaman ang
 * susunod na orderId, at ang pagbasa-at-pagsulat na iyon ay kailangang
 * atomic — kung dalawang release ang sabay-sabay na nangyari, dapat
 * walang dalawang magkaparehong ORD number. writeBatch ay write-only,
 * hindi puwedeng magbasa.
 *
 * Ang clamp lookup (by clampId field) ay query, at hindi puwede ang
 * query sa loob ng Firestore transaction — kaya nananatili itong nasa
 * labas, bago magsimula ang transaction; ang resolved na document
 * reference na lang ang dinadala papasok.
 */
export const markViolationAsReleased = async (params: {
  violationId: string;
  cin: string;
  plateNo: string;
  location: string;
  clampId: string | null;
  verifiedAt: Timestamp | null;
  officerName: string;
  /** Written into the releaseLog entry — without it, "Total Fine Paid"
   *  shows ₱0.00 on every release, since nothing else captures it there. */
  totalPaid: number;
}): Promise<string> => {
  const violationRef = doc(db, "violations", params.violationId);
  const durationMinutes = computeWaitingMinutes(params.verifiedAt);
  const orderCounterRef = doc(db, "counters", "releaseOrder");
  const releaseLogRef = doc(collection(db, "releaseLog"));
  const auditRef = doc(collection(db, "auditLogs"));

  // Resolved outside the transaction — see note above.
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

    // 2. Clamp — balik sa available para magamit ulit.
    //    Nili-clear ang cycle timestamps; ang permanenteng history ay nasa
    //    violations at releaseLog, hindi sa clamp document.
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

    // 3. Release log — immutable history
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

/**
 * Inaaprubahan o tinatanggihan ng OIC ang release request, sa isang atomic
 * write kasama ang audit log.
 *
 * Sa approve, lumilipat ang violation sa "Approved by OIC" at doon pa lang
 * siya lumalabas sa release queue ng Release Officer.
 *
 * Sa reject, bumabalik siya sa "Awaiting OIC Approval" ay HINDI — nagiging
 * "Rejected by OIC" siya at may naitalang dahilan. Bayad na ang violator,
 * kaya hindi siya pwedeng ibalik sa "Unpaid"; kailangan ng hiwalay na
 * desisyon kung ano ang susunod na mangyayari sa kaso.
 */
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

    // Dito nasusulat ang readyAt ng clamp. Kung wala ito, walang
    // nagse-set ng field na yun kahit saan — lumulundag ang clamp mula
    // "verified" diretso sa "released", at laging zero ang Ready card
    // sa QR Management.
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