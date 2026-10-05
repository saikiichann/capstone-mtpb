import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase'; // adjust path to your firebase init
import PageHeader from '../../components/PageHeader';
import './FieldUpdates.css';

type FieldUpdate = {
  id: string;
  time: string;
  officer: string;
  sector: string;
  location: string;
  detail: string;
};

// Helper: format a Firestore Timestamp (or Date) into "10:41 AM"
function formatTime(value: any): string {
  if (!value) return '';
  const date: Date =
    typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Helper: build the detail line from a field-updates doc
function buildDetail(data: any): string {
  const parts: string[] = [];
  if (data.cin) parts.push(`${data.cin} encoded`);
  if (data.violation) parts.push(data.violation);
  if (data.notes) parts.push(data.notes);
  if (data.photoCount) parts.push(`${data.photoCount} photos`);
  return parts.join(' · ');
}

export default function FieldUpdates() {
  const [updates, setUpdates] = useState<FieldUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Real-time listener — the "LIVE FEED" label implies live updates.
    const q = query(
      collection(db, 'fieldUpdates'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rows: FieldUpdate[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            time: formatTime(data.createdAt),
            officer: data.officerName ?? 'Unknown Officer',
            sector: data.sector ?? '—',
            location: data.location ?? '—',
            detail: buildDetail(data),
          };
        });
        setUpdates(rows);
        setLoading(false);
      },
      (err) => {
        console.error('Field updates listener failed:', err);
        setError('Unable to load field updates.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <div>
      <PageHeader title="Field Updates" />
      <div className="page-body">
        <div className="card">
          <p className="page-eyebrow">LIVE FEED</p>
          <h2 className="page-title" style={{ marginBottom: 16 }}>
            Recent Field Submissions
          </h2>

          {loading && (
            <p className="field-update-detail">Loading field updates…</p>
          )}

          {error && (
            <p className="field-update-detail" style={{ color: '#DC2626' }}>
              {error}
            </p>
          )}

          {!loading && !error && updates.length === 0 && (
            <p className="field-update-detail">No field updates yet.</p>
          )}

          {!loading && !error && updates.length > 0 && (
            <div className="field-updates-list">
              {updates.map((u) => (
                <div key={u.id} className="field-update-item">
                  <span className="field-update-time">{u.time}</span>
                  <div>
                    <div className="field-update-title">
                      {u.officer} · {u.sector} — {u.location}
                    </div>
                    <div className="field-update-detail">{u.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}