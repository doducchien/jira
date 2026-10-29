"use client";

import { formatDuration } from "@/lib/time";
import { useSession } from "./session";

/**
 * Jira's time-tracking bar: logged time over grey remaining; the logged part
 * turns orange when logged + remaining overshoots the original estimate.
 */
export function TimeTrackingBar({
  spent,
  remaining,
  original,
  compact,
}: {
  spent: number;
  remaining: number;
  original?: number;
  compact?: boolean;
}) {
  const { timeConfig } = useSession();
  const total = Math.max(spent + remaining, original ?? 0, 1);
  const overEstimate = !!original && spent + remaining > original;

  return (
    <div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
        <div className={overEstimate ? "bg-[#e56910]" : "bg-brand"} style={{ width: `${(spent / total) * 100}%` }} />
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between text-xs text-subtle">
          <span>{spent ? `${formatDuration(spent, timeConfig)} logged` : "No time logged"}</span>
          <span>
            {remaining || !original
              ? `${formatDuration(remaining, timeConfig)} remaining`
              : `${formatDuration(original, timeConfig)} original estimate`}
          </span>
        </div>
      )}
    </div>
  );
}
