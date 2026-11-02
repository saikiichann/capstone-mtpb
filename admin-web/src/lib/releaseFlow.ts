/* ------------------------------------------------------------------
   RELEASE FLOW — the checks before "Mark as Released"

   Used by the Release Details panel and the notification bell, so every
   release goes through the same steps as the Release Queue:
     1. the violation still exists and is "Approved by OIC"
     2. the payment is Verified
     3. FIFO warning if an older vehicle is waiting
     4. confirmation, then markViolationAsReleased (lib/release.ts)
------------------------------------------------------------------ */
import { collection, doc, getDoc, getDocs, query, where, type Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { buildQueue, markViolationAsReleased, RELEASE_QUEUE_STATUS } from "./release";
import { locationDetailsOf, placeLine } from "./locationDetails";

export type ReleaseOutcome =
  | "released"
  | "already-released"
  | "missing"
  | "not-approved"
  | "unpaid"
  | "cancelled";

export async function confirmAndRelease(params: {
  violationId: string;
  officerName: string;
}): Promise<ReleaseOutcome> {
  const snap = await getDoc(doc(db, "violations", params.violationId));
  if (!snap.exists()) {
    alert("This violation no longer exists.");
    return "missing";
  }
  const data = snap.data();
  const cin = String(data.cin ?? "this vehicle");

  if (data.releaseStatus === "Released") {
    alert(`${cin} is already released.`);
    return "already-released";
  }
  if (data.releaseStatus !== RELEASE_QUEUE_STATUS) {
    alert(`${cin} is not approved for release (status: ${data.releaseStatus ?? "—"}).`);
    return "not-approved";
  }
  if (data.paymentStatus !== "Verified") {
    alert("Payment is not yet verified for this vehicle. It cannot be released.");
    return "unpaid";
  }

  // FIFO, like the Release Queue.
  const queueSnap = await getDocs(
    query(collection(db, "violations"), where("releaseStatus", "==", RELEASE_QUEUE_STATUS))
  );
  const first = buildQueue(queueSnap.docs).find((r) => r.canRelease);
  if (
    first &&
    first.id !== params.violationId &&
    !window.confirm(
      `FIFO order puts ${first.cin} (${first.queue}) ahead of ${cin}.\n\n` +
        `Releasing out of order breaks the First-In, First-Out rule. Continue anyway?`
    )
  ) {
    return "cancelled";
  }

  const plateNo = String(data.plateNo ?? "—");
  const details = locationDetailsOf(data);
  if (
    !window.confirm(
      `Mark ${cin} as released?\n\nPlate: ${plateNo}\nLocation: ${placeLine(details)}\n\n` +
        `This will also reset the clamp to "available" for reuse.`
    )
  ) {
    return "cancelled";
  }

  await markViolationAsReleased({
    violationId: params.violationId,
    cin,
    plateNo,
    location: String(data.location ?? "—"),
    clampId: (data.clampId as string) ?? null,
    verifiedAt: (data.verifiedAt as Timestamp | undefined) ?? null,
    officerName: params.officerName || "Release Officer",
    totalPaid: Number(data.totalPaid ?? data.fineAmount ?? 0),
    details,
  });
  return "released";
}
