/* ------------------------------------------------------------------
   Field Updates — live activity feed (shared by the OIC and Supervisor
   pages). Data: lib/fieldActivity.ts. View only.
------------------------------------------------------------------ */
import { useMemo, useState } from "react";
import {
  ACTIVITY_LABELS,
  useFieldActivity,
  type ActivityKind,
} from "../lib/fieldActivity";
import "./FieldActivityFeed.css";

type Range = "today" | "week";
type Filter = "all" | ActivityKind;

const MAX_SHOWN = 100;
const KINDS = Object.keys(ACTIVITY_LABELS) as ActivityKind[];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const sinceFor = (range: Range) => {
  const d = startOfToday();
  if (range === "week") d.setDate(d.getDate() - 6);
  return d;
};

const timeText = (d: Date) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const dayText = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function FieldActivityFeed({
  defaultFilter = "all",
}: {
  defaultFilter?: Filter;
}) {
  const [range, setRange] = useState<Range>("today");
  const [filter, setFilter] = useState<Filter>(defaultFilter);

  const since = useMemo(() => sinceFor(range), [range]);
  const { events, loading } = useFieldActivity(since);

  const counts = useMemo(() => {
    const c = { all: events.length } as Record<Filter, number>;
    KINDS.forEach((k) => (c[k] = events.filter((e) => e.kind === k).length));
    return c;
  }, [events]);

  const shown = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.kind === filter)),
    [events, filter]
  );

  const todayKey = startOfToday().getTime();

  return (
    <div className="fa-feed">
      <div className="fa-head">
        <div>
          <p className="fa-eyebrow">
            <span className="fa-live-dot" aria-hidden="true" />
            Live feed
          </p>
          <h2 className="fa-title">Field Activity</h2>
          <p className="fa-sub">
            Clamps, impounds, payments, releases and operations as they are recorded.
          </p>
        </div>

        <div className="fa-range" role="tablist" aria-label="Time range">
          {(["today", "week"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              className={`fa-range-btn${range === r ? " is-active" : ""}`}
              onClick={() => setRange(r)}
            >
              {r === "today" ? "Today" : "Last 7 days"}
            </button>
          ))}
        </div>
      </div>

      <div className="fa-filters" role="group" aria-label="Filter by type">
        {(["all", ...KINDS] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            className={`fa-chip${filter === f ? " is-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : ACTIVITY_LABELS[f]}
            <span className="fa-chip-count">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="fa-empty">Loading field activity...</div>
      ) : shown.length === 0 ? (
        <div className="fa-empty">
          {range === "today"
            ? "No field activity yet today."
            : "No field activity in the last 7 days."}
        </div>
      ) : (
        <>
          <ul className="fa-list">
            {shown.slice(0, MAX_SHOWN).map((e) => {
              const otherDay = e.time.getTime() < todayKey;
              return (
                <li key={e.id} className="fa-item">
                  <div className="fa-when">
                    <span className="fa-time">{timeText(e.time)}</span>
                    {otherDay && <span className="fa-day">{dayText(e.time)}</span>}
                  </div>
                  <div className="fa-body">
                    <p className="fa-item-title">
                      <span className={`fa-tag fa-tag-${e.kind}`}>
                        {ACTIVITY_LABELS[e.kind]}
                      </span>
                      {e.title}
                    </p>
                    {e.detail && <p className="fa-item-detail">{e.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          {shown.length > MAX_SHOWN && (
            <p className="fa-more">
              Showing the latest {MAX_SHOWN} of {shown.length}. Use the logs for the full
              history.
            </p>
          )}
        </>
      )}
    </div>
  );
}
