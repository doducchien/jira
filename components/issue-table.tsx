"use client";

import type { Issue } from "@/lib/jira/types";
import { formatDuration } from "@/lib/time";
import { useSession } from "./session";
import { TimeTrackingBar } from "./time-tracking";
import { Avatar, Button, IssueTypeIcon, StatusLozenge } from "./ui";
import { useWorkspace } from "./workspace";

export function IssueTable({ issues }: { issues: Issue[] }) {
  const { timeConfig } = useSession();
  const { openIssue, logWork } = useWorkspace();
  const fmt = (s?: number | null) => (s ? formatDuration(s, timeConfig) : "—");

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] text-sm">
        <thead>
          <tr className="border-b-2 border-line text-left text-xs font-semibold text-subtle">
            <th className="w-8 py-2 pl-2">T</th>
            <th className="w-28 py-2">Key</th>
            <th className="py-2">Summary</th>
            <th className="w-28 py-2">Parent</th>
            <th className="w-36 py-2">Status</th>
            <th className="w-40 py-2">Assignee</th>
            <th className="w-24 py-2 text-right">Estimate</th>
            <th className="w-24 py-2 text-right">Logged</th>
            <th className="w-24 py-2 text-right">Remaining</th>
            <th className="w-32 py-2 pl-4">Progress</th>
            <th className="w-24 py-2" />
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => {
            const f = issue.fields;
            return (
              <tr key={issue.id} className="group border-b border-line hover:bg-surface">
                <td className="py-2 pl-2">
                  <IssueTypeIcon type={f.issuetype} />
                </td>
                <td className="py-2">
                  <button type="button" className="font-medium text-brand hover:underline" onClick={() => openIssue(issue.key)}>
                    {issue.key}
                  </button>
                </td>
                <td className="max-w-0 py-2 pr-3">
                  <button type="button" className="block w-full truncate text-left hover:underline" onClick={() => openIssue(issue.key)}>
                    {f.summary}
                  </button>
                </td>
                <td className="py-2">
                  {f.parent ? (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-subtle hover:underline"
                      title={f.parent.fields?.summary}
                      onClick={() => openIssue(f.parent!.key)}
                    >
                      <IssueTypeIcon type={f.parent.fields?.issuetype} />
                      {f.parent.key}
                    </button>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="py-2">
                  <StatusLozenge status={f.status} />
                </td>
                <td className="py-2">
                  <span className="flex items-center gap-2 truncate">
                    <Avatar user={f.assignee} size={20} />
                    <span className="truncate">{f.assignee?.displayName ?? "Unassigned"}</span>
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{fmt(f.timeoriginalestimate)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(f.timespent)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(f.timeestimate)}</td>
                <td className="py-2 pl-4">
                  <TimeTrackingBar compact spent={f.timespent ?? 0} remaining={f.timeestimate ?? 0} original={f.timeoriginalestimate ?? undefined} />
                </td>
                <td className="py-2 text-right">
                  <Button variant="subtle" className="h-7 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => logWork({ issueKey: issue.key })}>
                    ⏱ Log
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
