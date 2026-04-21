import { ErrorBanner } from "@/components/ErrorBanner";
import { type ListWorkoutsParams, listWorkouts } from "@/lib/api";
import { formatDuration, formatIsoDateTime } from "@/lib/format";
import type { WorkoutSummary } from "@vitals/core";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface WorkoutsPageProps {
  searchParams: Promise<{
    type?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function WorkoutsPage({
  searchParams,
}: WorkoutsPageProps): Promise<React.ReactElement> {
  const raw = await searchParams;
  const type = firstValue(raw.type);
  const from = firstValue(raw.from);
  const to = firstValue(raw.to);

  const params: ListWorkoutsParams = { limit: 100 };
  if (type !== undefined && type !== "") params.type = type;
  if (from !== undefined && from !== "") params.from = from;
  if (to !== undefined && to !== "") params.to = to;

  const result = await listWorkouts(params);

  return (
    <div>
      <div className="kicker">
        <span>Sessions</span>
        <span>·</span>
        <span>Logged effort</span>
      </div>
      <h2 className="page-title">
        Every session, <em>accounted for.</em>
      </h2>
      <p className="page-subtitle">Filter by type and date range. Latest 100 workouts shown.</p>

      <form method="get" className="filters">
        <label>
          Type
          <input type="text" name="type" defaultValue={type ?? ""} placeholder="e.g. Running" />
        </label>
        <label>
          From
          <input type="date" name="from" defaultValue={from ?? ""} />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={to ?? ""} />
        </label>
        <button type="submit">Apply</button>
      </form>

      {result.ok ? (
        <WorkoutsTable workouts={result.data} />
      ) : (
        <ErrorBanner title="Could not load workouts" detail={result.message} />
      )}
    </div>
  );
}

function WorkoutsTable({ workouts }: { workouts: WorkoutSummary[] }): React.ReactElement {
  if (workouts.length === 0) {
    return <div className="empty-state">No workouts match those filters.</div>;
  }

  return (
    <table className="workouts-table">
      <thead>
        <tr>
          <th>Start</th>
          <th>Type</th>
          <th>Duration</th>
          <th>Source</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {workouts.map((workout) => (
          <tr key={workout.id}>
            <td>{formatIsoDateTime(workout.start_ts)}</td>
            <td>{workout.type === "" ? "—" : workout.type}</td>
            <td>{formatDuration(workout.duration_sec)}</td>
            <td style={{ color: "var(--text-muted)" }}>{workout.source ?? "—"}</td>
            <td>
              <Link href={`/workouts/${encodeURIComponent(workout.id)}`}>Detail →</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
