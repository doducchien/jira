"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AdfView } from "@/lib/jira/adf";
import { ISSUE_LIST_FIELDS, assignIssue, doTransition, getIssue, getTransitions, getWorklogs, searchAllIssues, searchIssueAssignees } from "@/lib/jira/api";
import type { Issue, Transition } from "@/lib/jira/types";
import { formatDate, formatDateTime, formatDuration, parseJiraDate } from "@/lib/time";
import { useAsync } from "@/lib/use-async";
import { InlineCreateChild, canHaveChildren, isEpic } from "./create-child";
import { UserPicker } from "./pickers";
import { useSession } from "./session";
import { TimeTrackingBar } from "./time-tracking";
import { Avatar, Button, ErrorBanner, IssueTypeIcon, JiraIcon, Spinner, StatusLozenge } from "./ui";
import { WorklogList } from "./worklog-list";
import { useWorkspace } from "./workspace";

/** Full issue view (Jira's issue modal), centred on the work log. */
export function IssueView({ issueKey, onClose }: { issueKey: string; onClose: () => void }) {
  const { version } = useWorkspace();
  const issue = useAsync(() => getIssue(issueKey), [issueKey, version]);

  useEffect(() => {
    // Dialogs opened on top of the issue handle their own Escape.
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[data-modal]") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[#091e427a] px-4 py-[4vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-6xl rounded-[3px] bg-white shadow-xl" role="dialog" aria-modal>
        {issue.data ? (
          <IssueBody issue={issue.data} onClose={onClose} />
        ) : (
          <div className="flex items-center justify-between p-6">
            {issue.error ? <ErrorBanner error={issue.error} /> : <Spinner />}
            <Button variant="subtle" onClick={onClose}>
              ✕
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function IssueBody({ issue, onClose }: { issue: Issue; onClose: () => void }) {
  const { site, timeConfig } = useSession();
  const { version, logWork, editEstimates, changed } = useWorkspace();
  const [tab, setTab] = useState<"worklog" | "comments">("worklog");
  const [newestFirst, setNewestFirst] = useState(true);
  const [creatingChild, setCreatingChild] = useState(false);
  const worklogs = useAsync(() => getWorklogs(issue.key), [issue.key, version]);
  const f = issue.fields;
  const tt = f.timetracking ?? {};

  const sortedWorklogs = [...(worklogs.data ?? [])].sort((a, b) => {
    const diff = parseJiraDate(a.started).getTime() - parseJiraDate(b.started).getTime();
    return newestFirst ? -diff : diff;
  });

  return (
    <>
      <div className="flex items-center gap-2 px-6 pt-4 text-sm text-subtle">
        <JiraIcon src={f.project?.avatarUrls?.["16x16"]} alt="" />
        <span>{f.project?.name}</span>
        {f.parent && (
          <>
            <span>/</span>
            <IssueTypeIcon type={f.parent.fields?.issuetype} />
            <span>{f.parent.key}</span>
          </>
        )}
        <span>/</span>
        <IssueTypeIcon type={f.issuetype} />
        <a href={`https://${site}/browse/${issue.key}`} target="_blank" rel="noreferrer" className="hover:underline">
          {issue.key}
        </a>
        <Button variant="subtle" className="ml-auto" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>

      <div className="grid gap-8 px-6 pb-8 pt-2 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium">{f.summary}</h1>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => logWork({ issueKey: issue.key })}>⏱ Log work</Button>
            <Button onClick={() => editEstimates(issue)}>Edit estimates</Button>
            {canHaveChildren(issue) && (
              <Button onClick={() => setCreatingChild(true)}>{isEpic(issue) ? "＋ Add child issue" : "＋ Create subtask"}</Button>
            )}
          </div>

          <h3 className="mt-6 mb-2 text-sm font-semibold">Description</h3>
          {f.description ? <AdfView node={f.description} /> : <p className="text-sm text-faint">No description</p>}

          <ChildIssues parent={issue} creating={creatingChild} setCreating={setCreatingChild} />

          <h3 className="mt-8 mb-2 text-sm font-semibold">Activity</h3>
          <div className="flex items-center gap-1 border-b border-line">
            {(
              [
                ["worklog", `Work log${worklogs.data ? ` (${worklogs.data.length})` : ""}`],
                ["comments", `Comments (${f.comment?.total ?? 0})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-2 py-1.5 text-sm font-medium ${
                  tab === key ? "border-brand text-brand" : "border-transparent text-subtle hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
            {tab === "worklog" && (
              <button type="button" className="ml-auto text-xs text-subtle hover:underline" onClick={() => setNewestFirst((v) => !v)}>
                {newestFirst ? "Newest first ↓" : "Oldest first ↑"}
              </button>
            )}
          </div>
          {tab === "worklog" ? (
            worklogs.error ? (
              <ErrorBanner error={worklogs.error} />
            ) : worklogs.data ? (
              <WorklogList issueKey={issue.key} worklogs={sortedWorklogs} />
            ) : (
              <div className="py-4">
                <Spinner />
              </div>
            )
          ) : (
            <ul className="divide-y divide-line">
              {(f.comment?.comments ?? []).map((c) => (
                <li key={c.id} className="flex gap-3 py-3">
                  <Avatar user={c.author} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-semibold">{c.author?.displayName}</span>{" "}
                      <span className="text-xs text-faint">{formatDateTime(c.created)}</span>
                    </div>
                    <AdfView node={c.body} />
                  </div>
                </li>
              ))}
              {!f.comment?.comments.length && <p className="py-4 text-sm text-subtle">No comments yet.</p>}
            </ul>
          )}
        </div>

        <aside className="space-y-4">
          <StatusButton issue={issue} onChanged={changed} />
          <div className="rounded-[3px] border border-line">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">Details</div>
            <dl className="space-y-3 px-4 py-3 text-sm">
              <Detail label="Assignee">
                <AssigneeField issue={issue} />
              </Detail>
              <Detail label="Reporter">
                <span className="flex items-center gap-2">
                  <Avatar user={f.reporter} />
                  {f.reporter?.displayName ?? "None"}
                </span>
              </Detail>
              <Detail label="Priority">
                <span className="flex items-center gap-2">
                  {f.priority && <JiraIcon src={f.priority.iconUrl} alt="" />}
                  {f.priority?.name ?? "None"}
                </span>
              </Detail>
              <Detail label="Original estimate">
                {tt.originalEstimateSeconds ? formatDuration(tt.originalEstimateSeconds, timeConfig) : "None"}
              </Detail>
              <Detail label="Time tracking">
                <button type="button" className="block w-full rounded p-1 text-left hover:bg-hover" onClick={() => editEstimates(issue)}>
                  <TimeTrackingBar
                    spent={tt.timeSpentSeconds ?? 0}
                    remaining={tt.remainingEstimateSeconds ?? 0}
                    original={tt.originalEstimateSeconds}
                  />
                </button>
              </Detail>
              {!!f.labels?.length && (
                <Detail label="Labels">
                  <span className="flex flex-wrap gap-1">
                    {f.labels.map((l) => (
                      <span key={l} className="rounded-[3px] bg-surface px-1.5 text-xs ring-1 ring-line">
                        {l}
                      </span>
                    ))}
                  </span>
                </Detail>
              )}
              {f.duedate && <Detail label="Due date">{formatDate(f.duedate)}</Detail>}
            </dl>
          </div>
          <div className="space-y-0.5 text-xs text-faint">
            {f.created && <p>Created {formatDateTime(f.created)}</p>}
            {f.updated && <p>Updated {formatDateTime(f.updated)}</p>}
          </div>
        </aside>
      </div>
    </>
  );
}

/** Children of an epic / story / task (Jira's "Child issues" panel), with their combined logged time. */
function ChildIssues({
  parent,
  creating,
  setCreating,
}: {
  parent: Issue;
  creating: boolean;
  setCreating: (v: boolean) => void;
}) {
  const { timeConfig } = useSession();
  const { version, openIssue, logWork, createChild, changed } = useWorkspace();
  const issueKey = parent.key;
  const children = useAsync(
    () => searchAllIssues(`parent = "${issueKey}" ORDER BY created ASC`, ISSUE_LIST_FIELDS, 500),
    [issueKey, version],
  );
  const list = children.data ?? [];
  if (!canHaveChildren(parent)) return null;
  if (!list.length && !creating) return children.error ? <ErrorBanner error={children.error} /> : null;

  const done = list.filter((c) => c.fields.status?.statusCategory?.key === "done").length;
  const spent = list.reduce((a, c) => a + (c.fields.timespent ?? 0), 0);
  const remaining = list.reduce((a, c) => a + (c.fields.timeestimate ?? 0), 0);

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-baseline gap-3">
        <h3 className="text-sm font-semibold">{isEpic(parent) ? "Child issues" : "Subtasks"}</h3>
        {list.length > 0 && (
          <span className="text-xs text-subtle">
            {done} of {list.length} done · {formatDuration(spent, timeConfig)} logged
          </span>
        )}
        <button
          type="button"
          className="ml-auto rounded px-1.5 text-lg leading-6 text-subtle hover:bg-hover"
          title={isEpic(parent) ? "Add child issue" : "Create subtask"}
          onClick={() => setCreating(true)}
        >
          ＋
        </button>
      </div>
      {list.length > 0 && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-success" style={{ width: `${(done / list.length) * 100}%` }} />
        </div>
      )}
      <ul className="divide-y divide-line rounded-[3px] border border-line">
        {list.map((c) => (
          <li key={c.id} className="group flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface">
            <IssueTypeIcon type={c.fields.issuetype} />
            <button type="button" className="shrink-0 font-medium text-brand hover:underline" onClick={() => openIssue(c.key)}>
              {c.key}
            </button>
            <span className="truncate">{c.fields.summary}</span>
            <span className="ml-auto flex shrink-0 items-center gap-3">
              <span className="text-xs tabular-nums text-subtle">{c.fields.timespent ? formatDuration(c.fields.timespent, timeConfig) : ""}</span>
              <button
                type="button"
                className="hidden text-xs font-medium text-brand hover:underline group-hover:inline"
                onClick={() => logWork({ issueKey: c.key })}
              >
                Log
              </button>
              <Avatar user={c.fields.assignee} size={20} />
              <StatusLozenge status={c.fields.status} />
            </span>
          </li>
        ))}
        {creating && (
          <li>
            <InlineCreateChild
              parent={parent}
              onCreated={changed}
              onCancel={() => setCreating(false)}
              onMoreFields={(summary, typeId) => {
                setCreating(false);
                createChild(parent, { summary, typeId });
              }}
            />
          </li>
        )}
      </ul>
      {remaining > 0 && <p className="mt-1 text-xs text-faint">{formatDuration(remaining, timeConfig)} remaining across children</p>}
    </section>
  );
}

/** Click-to-edit assignee, with Jira's "Assign to me" shortcut. */
function AssigneeField({ issue }: { issue: Issue }) {
  const { myself } = useSession();
  const { changed } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const assignee = issue.fields.assignee;

  async function assign(accountId: string | null) {
    setEditing(false);
    setBusy(true);
    setError(null);
    try {
      await assignIssue(issue.key, accountId);
      changed();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      {editing ? (
        <div
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
        >
          <UserPicker
            autoFocus
            placeholder="Search people"
            exclude={assignee ? [assignee.accountId] : []}
            search={(q) => searchIssueAssignees(issue.key, q)}
            onSelect={(u) => assign(u.accountId)}
          />
          <div className="mt-1 flex gap-3 text-xs font-medium">
            {assignee && (
              <button type="button" className="text-brand hover:underline" onClick={() => assign(null)}>
                Unassign
              </button>
            )}
            <button type="button" className="text-subtle hover:underline" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(true)}
          className="-mx-1 flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-hover"
          title="Change assignee"
        >
          <Avatar user={assignee} />
          <span className="truncate">{assignee?.displayName ?? "Unassigned"}</span>
          {busy && <Spinner className="ml-auto" />}
        </button>
      )}
      {!editing && assignee?.accountId !== myself.accountId && (
        <button type="button" disabled={busy} className="text-xs font-medium text-brand hover:underline" onClick={() => assign(myself.accountId)}>
          Assign to me
        </button>
      )}
      <ErrorBanner error={error} />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-2">
      <dt className="pt-0.5 font-semibold text-subtle">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function StatusButton({ issue, onChanged }: { issue: Issue; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [transitions, setTransitions] = useState<Transition[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setOpen((o) => !o);
    if (!transitions) getTransitions(issue.key).then(setTransitions, setError);
  }

  async function run(t: Transition) {
    setBusy(true);
    setOpen(false);
    try {
      await doTransition(issue.key, t.id);
      setTransitions(null);
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const category = issue.fields.status?.statusCategory?.colorName;
  const color =
    category === "green" ? "bg-[#1f845a] text-white hover:bg-[#216e4e]" : category === "yellow" ? "bg-brand text-white hover:bg-brand-hover" : "bg-[#091e420f] hover:bg-[#091e4224]";

  return (
    <div className="relative">
      <button type="button" onClick={toggle} disabled={busy} className={`inline-flex h-8 items-center gap-1 rounded-[3px] px-3 text-sm font-medium ${color}`}>
        {issue.fields.status?.name} ▾
      </button>
      {open && (
        <div className="absolute z-30 mt-1 min-w-[200px] rounded-[3px] bg-white py-1 shadow-lg ring-1 ring-line">
          {!transitions && !error && (
            <div className="px-3 py-2">
              <Spinner />
            </div>
          )}
          {transitions?.map((t) => (
            <button key={t.id} type="button" onClick={() => run(t)} className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-brand-subtle">
              <span>{t.name}</span>
              <StatusLozenge status={t.to} />
            </button>
          ))}
        </div>
      )}
      <div className="mt-2">
        <ErrorBanner error={error} />
      </div>
    </div>
  );
}
