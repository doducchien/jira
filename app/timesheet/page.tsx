"use client";

import { useState, type FormEvent } from "react";
import { IssuePicker, UserPicker } from "@/components/pickers";
import { useSession } from "@/components/session";
import { Avatar, Button, ErrorBanner, JiraIcon, Modal, Spinner, StatusLozenge, inputClass } from "@/components/ui";
import { WorklogList } from "@/components/worklog-list";
import { useWorkspace } from "@/components/workspace";
import { getWorklogsInRange, type WorklogEntry } from "@/lib/jira/api";
import type { JiraUser, Status } from "@/lib/jira/types";
import {
  addDays,
  eachDay,
  endOfMonth,
  formatDate,
  formatDuration,
  formatHours,
  fromYmd,
  isWeekend,
  startOfDay,
  startOfMonth,
  startOfWeek,
  ymd,
} from "@/lib/time";
import { useAsync } from "@/lib/use-async";

type Row = {
  key: string;
  summary: string;
  iconUrl?: string;
  status?: Status;
  cells: Map<string, WorklogEntry[]>;
  total: number;
};

export default function TimesheetPage() {
  const { myself, timeConfig } = useSession();
  const { version, openIssue, logWork } = useWorkspace();
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [user, setUser] = useState<JiraUser>(myself);
  const [jqlDraft, setJqlDraft] = useState("");
  const [jql, setJql] = useState("");
  const [showWeekends, setShowWeekends] = useState(false);
  const [extraRows, setExtraRows] = useState<{ key: string; summary: string; img?: string }[]>([]);
  const [selected, setSelected] = useState<{ key: string; day: string } | null>(null);

  const from = mode === "week" ? startOfWeek(anchor) : startOfMonth(anchor);
  const to = mode === "week" ? addDays(from, 6) : endOfMonth(anchor);
  const today = ymd(new Date());

  const data = useAsync(
    () => getWorklogsInRange({ from, to, accountIds: [user.accountId], jql }),
    [ymd(from), ymd(to), user.accountId, jql, version],
  );

  const rows = new Map<string, Row>();
  for (const entry of data.data ?? []) {
    const { issue } = entry;
    let row = rows.get(issue.key);
    if (!row) {
      row = {
        key: issue.key,
        summary: issue.fields.summary,
        iconUrl: issue.fields.issuetype?.iconUrl,
        status: issue.fields.status,
        cells: new Map(),
        total: 0,
      };
      rows.set(issue.key, row);
    }
    const day = ymd(entry.started);
    row.cells.set(day, [...(row.cells.get(day) ?? []), entry]);
    row.total += entry.worklog.timeSpentSeconds;
  }
  for (const extra of extraRows) {
    if (!rows.has(extra.key)) rows.set(extra.key, { key: extra.key, summary: extra.summary, iconUrl: extra.img, cells: new Map(), total: 0 });
  }
  const rowList = [...rows.values()];

  const dayTotals = new Map<string, number>();
  for (const row of rowList) for (const [day, entries] of row.cells) dayTotals.set(day, (dayTotals.get(day) ?? 0) + entries.reduce((a, e) => a + e.worklog.timeSpentSeconds, 0));
  const grandTotal = [...dayTotals.values()].reduce((a, b) => a + b, 0);

  const days = eachDay(from, to).filter((d) => showWeekends || !isWeekend(d) || dayTotals.has(ymd(d)));
  const dayTarget = timeConfig.hoursPerDay * 3600;
  const expected = eachDay(from, to).filter((d) => !isWeekend(d) && ymd(d) <= today).length * dayTarget;
  const isMe = user.accountId === myself.accountId;

  const shift = (dir: number) =>
    setAnchor((a) => (mode === "week" ? addDays(a, dir * 7) : new Date(a.getFullYear(), a.getMonth() + dir, 1)));

  const title =
    mode === "week"
      ? `${formatDate(from)} – ${formatDate(to)}`
      : from.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  function applyJql(e: FormEvent) {
    e.preventDefault();
    setJql(jqlDraft.trim());
  }

  const selectedEntries = selected ? (rows.get(selected.key)?.cells.get(selected.day) ?? []) : [];

  return (
    <div className="px-8 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-4 text-2xl font-medium">Timesheet</h1>
        <div className="flex rounded-[3px] ring-1 ring-line">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-sm font-medium capitalize ${mode === m ? "bg-brand-subtle text-brand" : "text-subtle hover:bg-hover"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="subtle" onClick={() => shift(-1)} aria-label="Previous">
            ‹
          </Button>
          <Button onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
          <Button variant="subtle" onClick={() => shift(1)} aria-label="Next">
            ›
          </Button>
        </div>
        <span className="text-sm font-semibold">{title}</span>
        {data.loading && <Spinner />}
        <label className="ml-auto flex items-center gap-2 text-sm text-subtle">
          <input type="checkbox" className="accent-brand" checked={showWeekends} onChange={(e) => setShowWeekends(e.target.checked)} />
          Show weekends
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[260px_260px_minmax(0,1fr)]">
        <div>
          <div className="mb-1 text-xs font-semibold text-subtle">Person</div>
          <div className="flex items-center gap-2">
            <Avatar user={user} />
            <span className="truncate text-sm">{user.displayName}</span>
            {!isMe && (
              <button type="button" className="text-xs text-brand hover:underline" onClick={() => setUser(myself)}>
                Back to me
              </button>
            )}
          </div>
          <div className="mt-1">
            <UserPicker placeholder="View someone else's timesheet" onSelect={setUser} exclude={[user.accountId]} />
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-subtle">Add issue row</div>
          <IssuePicker
            placeholder="Pick an issue to log time on"
            onSelect={(i) => setExtraRows((r) => (r.some((x) => x.key === i.key) ? r : [...r, { key: i.key, summary: i.summaryText, img: i.img }]))}
          />
        </div>
        <form onSubmit={applyJql}>
          <div className="mb-1 text-xs font-semibold text-subtle">Filter (JQL)</div>
          <div className="flex gap-2">
            <input
              className={`${inputClass} font-mono`}
              value={jqlDraft}
              onChange={(e) => setJqlDraft(e.target.value)}
              placeholder="e.g. project = ABC"
              spellCheck={false}
            />
            <Button type="submit" className="h-9">
              Apply
            </Button>
          </div>
        </form>
      </div>

      <div className="mt-3">
        <ErrorBanner error={data.error} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-[3px] border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface text-xs text-subtle">
              <th className="sticky left-0 z-10 min-w-[320px] border-b border-line bg-surface px-3 py-2 text-left font-semibold">Issue</th>
              {days.map((d) => (
                <th
                  key={ymd(d)}
                  className={`min-w-[56px] border-b border-l border-line px-1 py-2 text-center font-semibold ${ymd(d) === today ? "bg-brand-subtle text-brand" : isWeekend(d) ? "bg-[#f1f2f4]" : ""}`}
                >
                  <div className="uppercase">{d.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                  <div className="text-[13px] text-ink">{d.getDate()}</div>
                </th>
              ))}
              <th className="min-w-[72px] border-b border-l border-line px-2 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rowList.map((row) => (
              <tr key={row.key} className="group hover:bg-surface">
                <td className="sticky left-0 z-10 max-w-[360px] border-b border-line bg-white px-3 py-1.5 group-hover:bg-surface">
                  <div className="flex items-center gap-2">
                    <JiraIcon src={row.iconUrl} alt="" />
                    <button type="button" className="shrink-0 font-medium text-brand hover:underline" onClick={() => openIssue(row.key)}>
                      {row.key}
                    </button>
                    <span className="truncate" title={row.summary}>
                      {row.summary}
                    </span>
                    {row.status && (
                      <span className="ml-auto shrink-0">
                        <StatusLozenge status={row.status} />
                      </span>
                    )}
                  </div>
                </td>
                {days.map((d) => {
                  const day = ymd(d);
                  const entries = row.cells.get(day);
                  const secs = entries?.reduce((a, e) => a + e.worklog.timeSpentSeconds, 0) ?? 0;
                  return (
                    <td key={day} className={`border-b border-l border-line p-0 text-center ${isWeekend(d) ? "bg-[#f7f8f9]" : ""}`}>
                      <button
                        type="button"
                        title={entries ? `${entries.length} worklog(s)` : isMe ? "Log work" : undefined}
                        disabled={!entries && !isMe}
                        onClick={() => (entries ? setSelected({ key: row.key, day }) : logWork({ issueKey: row.key, date: d }))}
                        className={`h-9 w-full tabular-nums ${
                          entries ? "font-medium text-ink hover:bg-brand-subtle" : "text-transparent hover:bg-brand-subtle hover:text-brand disabled:hover:bg-transparent"
                        }`}
                      >
                        {entries ? formatHours(secs) : "+"}
                      </button>
                    </td>
                  );
                })}
                <td className="border-b border-l border-line px-2 text-right font-semibold tabular-nums">{formatHours(row.total) || "–"}</td>
              </tr>
            ))}
            {!rowList.length && !data.loading && (
              <tr>
                <td colSpan={days.length + 2} className="px-3 py-8 text-center text-sm text-subtle">
                  No work logged in this period. Add an issue row above to start logging.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-surface font-semibold">
              <td className="sticky left-0 z-10 bg-surface px-3 py-2 text-xs uppercase text-subtle">
                Total · expected {formatDuration(expected, timeConfig)}
              </td>
              {days.map((d) => {
                const secs = dayTotals.get(ymd(d)) ?? 0;
                const past = ymd(d) <= today;
                const tone =
                  secs >= dayTarget ? "text-[#216e4e]" : secs > 0 ? "text-[#a54800]" : past && !isWeekend(d) ? "text-danger" : "text-faint";
                return (
                  <td key={ymd(d)} className={`border-l border-line px-1 py-2 text-center tabular-nums ${tone}`}>
                    {formatHours(secs) || (past && !isWeekend(d) ? "0h" : "–")}
                  </td>
                );
              })}
              <td className={`border-l border-line px-2 py-2 text-right tabular-nums ${grandTotal >= expected ? "text-[#216e4e]" : "text-[#a54800]"}`}>
                {formatHours(grandTotal) || "0h"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {selected && (
        <Modal
          title={`${selected.key} · ${formatDate(fromYmd(selected.day))}`}
          onClose={() => setSelected(null)}
          width="max-w-2xl"
          footer={
            <>
              <Button variant="subtle" onClick={() => setSelected(null)}>
                Close
              </Button>
              {isMe && (
                <Button
                  variant="primary"
                  onClick={() => logWork({ issueKey: selected.key, date: fromYmd(selected.day) })}
                >
                  Log more time
                </Button>
              )}
            </>
          }
        >
          <WorklogList issueKey={selected.key} worklogs={selectedEntries.map((e) => e.worklog)} />
        </Modal>
      )}
    </div>
  );
}
