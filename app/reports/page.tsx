"use client";

import { Fragment, useState, type FormEvent } from "react";
import { UserPicker } from "@/components/pickers";
import { useSession } from "@/components/session";
import { Avatar, Button, ErrorBanner, Field, IssueTypeIcon, Spinner, inputClass } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { adfToText } from "@/lib/jira/adf";
import { getWorklogsInRange, type WorklogEntry } from "@/lib/jira/api";
import type { JiraUser } from "@/lib/jira/types";
import { formatDate, formatDateTime, formatDuration, formatHours, fromYmd, startOfMonth, ymd } from "@/lib/time";
import { useAsync } from "@/lib/use-async";

type GroupBy = "issue" | "user" | "day" | "project";

type Query = { from: string; to: string; users: JiraUser[]; jql: string };

function groupKey(e: WorklogEntry, by: GroupBy): [string, string] {
  switch (by) {
    case "issue":
      return [e.issue.key, `${e.issue.key} ${e.issue.fields.summary}`];
    case "user":
      return [e.worklog.author?.accountId ?? "?", e.worklog.author?.displayName ?? "Unknown"];
    case "day":
      return [ymd(e.started), formatDate(e.started)];
    case "project":
      return [e.issue.fields.project?.key ?? "?", e.issue.fields.project?.name ?? "Unknown project"];
  }
}

function toCsv(entries: WorklogEntry[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ["Date", "Started", "Author", "Project", "Issue", "Summary", "Hours", "Time spent", "Description"];
  const lines = entries.map((e) =>
    [
      ymd(e.started),
      e.worklog.started,
      e.worklog.author?.displayName ?? "",
      e.issue.fields.project?.key ?? "",
      e.issue.key,
      e.issue.fields.summary,
      (e.worklog.timeSpentSeconds / 3600).toFixed(2),
      e.worklog.timeSpent,
      adfToText(e.worklog.comment).trim(),
    ]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export default function ReportsPage() {
  const { myself, timeConfig } = useSession();
  const { version, openIssue, editWorklog, deleteWorklog } = useWorkspace();
  const [draft, setDraft] = useState<Query>(() => ({
    from: ymd(startOfMonth(new Date())),
    to: ymd(new Date()),
    users: [myself],
    jql: "",
  }));
  const [query, setQuery] = useState(draft);
  const [groupBy, setGroupBy] = useState<GroupBy>("issue");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const data = useAsync(
    () =>
      getWorklogsInRange({
        from: fromYmd(query.from),
        to: fromYmd(query.to),
        accountIds: query.users.map((u) => u.accountId),
        jql: query.jql,
      }),
    [query, version],
  );

  const groups = new Map<string, { label: string; entries: WorklogEntry[]; total: number }>();
  for (const e of data.data ?? []) {
    const [key, label] = groupKey(e, groupBy);
    const g = groups.get(key) ?? { label, entries: [], total: 0 };
    g.entries.push(e);
    g.total += e.worklog.timeSpentSeconds;
    groups.set(key, g);
  }
  const sorted = [...groups.entries()].sort(([a, ga], [b, gb]) => (groupBy === "day" ? a.localeCompare(b) : gb.total - ga.total));
  const total = sorted.reduce((a, [, g]) => a + g.total, 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    setQuery(draft);
    setExpanded(new Set());
  }

  function download() {
    if (!data.data) return;
    const blob = new Blob(["﻿" + toCsv(data.data)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `worklogs_${query.from}_${query.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const toggle = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <h1 className="text-2xl font-medium">Worklog report</h1>

      <form onSubmit={submit} className="mt-4 grid gap-4 rounded-[3px] border border-line p-4 md:grid-cols-[160px_160px_minmax(0,1fr)]">
        <Field label="From">
          <input type="date" className={inputClass} value={draft.from} max={draft.to} onChange={(e) => setDraft({ ...draft, from: e.target.value })} required />
        </Field>
        <Field label="To">
          <input type="date" className={inputClass} value={draft.to} min={draft.from} onChange={(e) => setDraft({ ...draft, to: e.target.value })} required />
        </Field>
        <Field label="Filter (JQL, optional)">
          <input
            className={`${inputClass} font-mono`}
            value={draft.jql}
            onChange={(e) => setDraft({ ...draft, jql: e.target.value })}
            placeholder="e.g. project in (ABC, XYZ)"
            spellCheck={false}
          />
        </Field>
        <div className="md:col-span-3">
          <div className="mb-1 text-xs font-semibold text-subtle">People (empty = everyone)</div>
          <div className="flex flex-wrap items-center gap-2">
            {draft.users.map((u) => (
              <span key={u.accountId} className="flex items-center gap-1.5 rounded-full bg-surface py-0.5 pl-0.5 pr-2 text-sm ring-1 ring-line">
                <Avatar user={u} size={20} />
                {u.displayName}
                <button
                  type="button"
                  className="text-subtle hover:text-danger"
                  aria-label={`Remove ${u.displayName}`}
                  onClick={() => setDraft({ ...draft, users: draft.users.filter((x) => x.accountId !== u.accountId) })}
                >
                  ✕
                </button>
              </span>
            ))}
            <div className="w-64">
              <UserPicker
                placeholder="Add person"
                exclude={draft.users.map((u) => u.accountId)}
                onSelect={(u) => setDraft({ ...draft, users: [...draft.users, u] })}
              />
            </div>
            <Button variant="primary" type="submit" className="ml-auto h-9">
              Generate
            </Button>
          </div>
        </div>
      </form>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-sm text-subtle">Group by</span>
        <div className="flex rounded-[3px] ring-1 ring-line">
          {(["issue", "user", "day", "project"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              className={`px-3 py-1 text-sm font-medium capitalize ${groupBy === g ? "bg-brand-subtle text-brand" : "text-subtle hover:bg-hover"}`}
            >
              {g}
            </button>
          ))}
        </div>
        {data.loading && <Spinner />}
        <span className="ml-auto text-sm">
          <b>{formatDuration(total, timeConfig)}</b> <span className="text-subtle">({formatHours(total) || "0h"}) · {data.data?.length ?? 0} worklogs</span>
        </span>
        <Button onClick={download} disabled={!data.data?.length}>
          Export CSV
        </Button>
      </div>

      <div className="mt-3">
        <ErrorBanner error={data.error} />
      </div>

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-line text-left text-xs font-semibold text-subtle">
            <th className="py-2 pl-2">{groupBy[0].toUpperCase() + groupBy.slice(1)}</th>
            <th className="w-24 py-2 text-right">Worklogs</th>
            <th className="w-32 py-2 text-right">Time spent</th>
            <th className="w-20 py-2 pr-2 text-right">Hours</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([key, g]) => (
            <Fragment key={key}>
              <tr className="cursor-pointer border-b border-line hover:bg-surface" onClick={() => toggle(key)}>
                <td className="py-2 pl-2 font-medium">
                  <span className="mr-2 inline-block w-3 text-subtle">{expanded.has(key) ? "▾" : "▸"}</span>
                  {g.label}
                </td>
                <td className="py-2 text-right tabular-nums">{g.entries.length}</td>
                <td className="py-2 text-right tabular-nums">{formatDuration(g.total, timeConfig)}</td>
                <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatHours(g.total)}</td>
              </tr>
              {expanded.has(key) &&
                g.entries.map((e) => (
                  <tr key={`${e.issue.key}-${e.worklog.id}`} className="group border-b border-line bg-surface/60 text-[13px]">
                    <td className="py-1.5 pl-9" colSpan={2}>
                      <div className="flex items-center gap-2">
                        <span className="w-36 shrink-0 text-faint">{formatDateTime(e.started)}</span>
                        <Avatar user={e.worklog.author} size={18} />
                        <IssueTypeIcon type={e.issue.fields.issuetype} />
                        <button type="button" className="shrink-0 text-brand hover:underline" onClick={() => openIssue(e.issue.key)}>
                          {e.issue.key}
                        </button>
                        <span className="truncate text-subtle">{adfToText(e.worklog.comment).trim() || e.issue.fields.summary}</span>
                        <span className="ml-auto hidden shrink-0 gap-2 text-xs group-hover:flex">
                          <button type="button" className="text-subtle hover:underline" onClick={() => editWorklog(e.issue.key, e.worklog)}>
                            Edit
                          </button>
                          <button type="button" className="text-subtle hover:underline" onClick={() => deleteWorklog(e.issue.key, e.worklog)}>
                            Delete
                          </button>
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{formatDuration(e.worklog.timeSpentSeconds, timeConfig)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatHours(e.worklog.timeSpentSeconds)}</td>
                  </tr>
                ))}
            </Fragment>
          ))}
          {!sorted.length && !data.loading && !data.error && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-subtle">
                No worklogs found for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
