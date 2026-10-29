"use client";

import { useState } from "react";
import { IssueTable } from "@/components/issue-table";
import { useSession } from "@/components/session";
import { ErrorBanner, Spinner } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { ISSUE_LIST_FIELDS, getWorklogsInRange, searchIssues } from "@/lib/jira/api";
import { addDays, eachDay, formatDuration, formatHours, isWeekend, startOfDay, startOfMonth, startOfWeek, ymd } from "@/lib/time";
import { useAsync } from "@/lib/use-async";

const TABS = [
  { key: "worked", label: "Worked on", jql: "worklogAuthor = currentUser() AND worklogDate >= -30d ORDER BY updated DESC" },
  { key: "viewed", label: "Viewed", jql: "issue in issueHistory() ORDER BY lastViewed DESC" },
  { key: "assigned", label: "Assigned to me", jql: "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC" },
] as const;

export default function YourWorkPage() {
  const { myself, timeConfig } = useSession();
  const { version, logWork } = useWorkspace();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("worked");

  const today = startOfDay(new Date());
  const weekStart = startOfWeek(today);
  const monthStart = startOfMonth(today);
  const from = weekStart < monthStart ? weekStart : monthStart;

  const logs = useAsync(
    () => getWorklogsInRange({ from, to: today, accountIds: [myself.accountId] }),
    [myself.accountId, ymd(today), version],
  );
  const jql = TABS.find((t) => t.key === tab)!.jql;
  const issues = useAsync(() => searchIssues(jql, ISSUE_LIST_FIELDS, undefined, 50), [jql, version]);

  const byDay = new Map<string, number>();
  for (const e of logs.data ?? []) byDay.set(ymd(e.started), (byDay.get(ymd(e.started)) ?? 0) + e.worklog.timeSpentSeconds);
  const sum = (start: Date) => [...byDay].filter(([d]) => d >= ymd(start)).reduce((a, [, s]) => a + s, 0);

  const dayTarget = timeConfig.hoursPerDay * 3600;
  const weekDays = eachDay(weekStart, addDays(weekStart, 6));
  const workdaysSoFar = eachDay(weekStart, today).filter((d) => !isWeekend(d)).length;
  const stats = [
    { label: "Today", value: byDay.get(ymd(today)) ?? 0, target: isWeekend(today) ? 0 : dayTarget },
    { label: "This week", value: sum(weekStart), target: workdaysSoFar * dayTarget },
    { label: "This month", value: sum(monthStart), target: eachDay(monthStart, today).filter((d) => !isWeekend(d)).length * dayTarget },
  ];

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <h1 className="text-2xl font-medium">Your work</h1>

      <section className="mt-6 grid gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2fr)]">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[3px] border border-line p-4">
            <div className="text-xs font-semibold uppercase text-subtle">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {logs.loading && !logs.data ? <Spinner /> : formatDuration(s.value, timeConfig)}
            </div>
            {s.target > 0 && (
              <div className="mt-1 text-xs text-faint">
                of {formatDuration(s.target, timeConfig)} expected
                {s.value < s.target && <span className="text-[#a54800]"> · {formatDuration(s.target - s.value, timeConfig)} missing</span>}
              </div>
            )}
          </div>
        ))}
        <div className="rounded-[3px] border border-line p-4">
          <div className="text-xs font-semibold uppercase text-subtle">This week</div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {weekDays.map((d) => {
              const secs = byDay.get(ymd(d)) ?? 0;
              const future = d > today;
              const tone = future
                ? "bg-surface text-faint"
                : secs >= dayTarget
                  ? "bg-[#dcfff1] text-[#216e4e]"
                  : secs > 0
                    ? "bg-[#fff7d6] text-[#7f5f01]"
                    : isWeekend(d)
                      ? "bg-surface text-faint"
                      : "bg-[#ffeceb] text-[#ae2e24]";
              return (
                <button
                  key={ymd(d)}
                  type="button"
                  onClick={() => logWork({ date: d })}
                  title={`Log work on ${d.toDateString()}`}
                  className={`rounded-[3px] px-1 py-2 text-center hover:ring-2 hover:ring-brand ${tone} ${ymd(d) === ymd(today) ? "ring-2 ring-brand" : ""}`}
                >
                  <div className="text-[11px] font-semibold uppercase">{d.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                  <div className="text-xs">{d.getDate()}</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums">{formatHours(secs) || "–"}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <div className="mt-2">
        <ErrorBanner error={logs.error} />
      </div>

      <div className="mt-8 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-brand text-brand" : "border-transparent text-subtle hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-2">
        <ErrorBanner error={issues.error} />
        {issues.loading && !issues.data ? (
          <div className="py-6">
            <Spinner />
          </div>
        ) : issues.data?.issues.length ? (
          <IssueTable issues={issues.data.issues} />
        ) : (
          !issues.error && <p className="py-6 text-sm text-subtle">Nothing here yet.</p>
        )}
      </div>
    </div>
  );
}
