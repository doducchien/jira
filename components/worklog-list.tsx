"use client";

import { AdfView } from "@/lib/jira/adf";
import type { Worklog } from "@/lib/jira/types";
import { formatDateTime, formatDuration } from "@/lib/time";
import { useSession } from "./session";
import { Avatar } from "./ui";
import { useWorkspace } from "./workspace";

export function WorklogItem({ issueKey, worklog }: { issueKey: string; worklog: Worklog }) {
  const { timeConfig } = useSession();
  const { editWorklog, deleteWorklog } = useWorkspace();
  return (
    <li className="flex gap-3 py-3">
      <Avatar user={worklog.author} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">{worklog.author?.displayName ?? "Unknown"}</span>
          <span className="text-subtle">logged</span>
          <span className="font-semibold">{formatDuration(worklog.timeSpentSeconds, timeConfig)}</span>
          <span className="text-xs text-faint">{formatDateTime(worklog.started)}</span>
        </div>
        {worklog.comment && (
          <div className="mt-1">
            <AdfView node={worklog.comment} />
          </div>
        )}
        <div className="mt-1 flex gap-3 text-xs font-medium text-subtle">
          <button type="button" className="hover:underline" onClick={() => editWorklog(issueKey, worklog)}>
            Edit
          </button>
          <button type="button" className="hover:underline" onClick={() => deleteWorklog(issueKey, worklog)}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

export function WorklogList({ issueKey, worklogs }: { issueKey: string; worklogs: Worklog[] }) {
  if (!worklogs.length) return <p className="py-4 text-sm text-subtle">No work has been logged on this issue yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {worklogs.map((w) => (
        <WorklogItem key={w.id} issueKey={issueKey} worklog={w} />
      ))}
    </ul>
  );
}
