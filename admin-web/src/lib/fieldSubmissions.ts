/* Field Updates feed (fieldSubmissions) — same reading on every role's page.
   The writer (enforcer app) isn't final yet, so the time may be in
   `createdAt` or `timestamp`; both are accepted. */
import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";

export const submissionTime = (data: DocumentData): Timestamp | null =>
  ((data.createdAt ?? data.timestamp ?? data.submittedAt) as Timestamp) ?? null;

const millis = (t: Timestamp | null) => {
  try {
    return t ? t.toMillis() : 0;
  } catch {
    return 0;
  }
};

/** Newest first, at most `max`. */
export const latestSubmissions = (
  docs: QueryDocumentSnapshot<DocumentData>[],
  max: number
): QueryDocumentSnapshot<DocumentData>[] =>
  [...docs]
    .sort((a, b) => millis(submissionTime(b.data())) - millis(submissionTime(a.data())))
    .slice(0, max);
