"use client";

import { useState, type FormEvent } from "react";
import { adfToText, textToAdf } from "@/lib/jira/adf";
import { addWorklog, deleteWorklog, getIssue, updateEstimates, updateWorklog, type EstimateAdjustment } from "@/lib/jira/api";
import type { AdjustEstimate, Issue, Worklog } from "@/lib/jira/types";
import { formatDuration, parseDuration, parseJiraDate, toDateTimeLocal, type TimeConfig } from "@/lib/time";
import { useAsync } from "@/lib/use-async";
import { IssuePicker } from "./pickers";
import { useSession } from "./session";
import { TimeTrackingBar } from "./time-tracking";
import { Button, ErrorBanner, Field, IssueTypeIcon, JiraIcon, Modal, Spinner, inputClass } from "./ui";

const FORMAT_HINT = "Use the format: 2w 4d 6h 45m";

function AdjustEstimateField({
  value,
  onChange,
  amount,
  onAmountChange,
  options,
}: {
  value: AdjustEstimate;
  onChange: (v: AdjustEstimate) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  options: Partial<Record<AdjustEstimate, string>>;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold text-subtle">Remaining estimate</legend>
      <div className="space-y-1.5">
        {(Object.entries(options) as [AdjustEstimate, string][]).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="radio" checked={value === key} onChange={() => onChange(key)} className="accent-brand" />
            <span className="shrink-0">{label}</span>
            {(key === "new" || key === "manual") && value === key && (
              <input
                className={`${inputClass} h-8 max-w-[140px]`}
                placeholder="e.g. 3h 30m"
                value={amount}
                autoFocus
                onChange={(e) => onAmountChange(e.target.value)}
              />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function adjustment(adjust: AdjustEstimate, amount: string, cfg: TimeConfig): EstimateAdjustment | string {
  if (adjust === "new" || adjust === "manual") {
    if (parseDuration(amount, cfg) === null) return `Invalid remaining estimate. ${FORMAT_HINT}`;
    return { adjustEstimate: adjust, value: amount.trim() };
  }
  return { adjustEstimate: adjust };
}

/** Create or edit a worklog — the equivalent of Jira's "Log work" / "Time tracking" dialog. */
export function LogWorkDialog({
  issueKey: initialKey,
  date,
  worklog,
  onClose,
  onSaved,
}: {
  issueKey?: string;
  date?: Date;
  worklog?: Worklog;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { timeConfig } = useSession();
  const [issueKey, setIssueKey] = useState(initialKey);
  const [spent, setSpent] = useState(worklog ? formatDuration(worklog.timeSpentSeconds, timeConfig) : "");
  const [started, setStarted] = useState(() => {
    if (worklog) return toDateTimeLocal(parseJiraDate(worklog.started));
    const now = new Date();
    if (!date) return toDateTimeLocal(now);
    const d = new Date(date);
    d.setHours(now.getHours(), now.getMinutes());
    return toDateTimeLocal(d);
  });
  const [comment, setComment] = useState(worklog ? adfToText(worklog.comment).trimEnd() : "");
  const [adjust, setAdjust] = useState<AdjustEstimate>("auto");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const issue = useAsync(() => (issueKey ? getIssue(issueKey) : Promise.resolve(undefined)), [issueKey]);

  const spentSeconds = parseDuration(spent, timeConfig);
  const tt = issue.data?.fields.timetracking ?? {};
  const delta = (spentSeconds ?? 0) - (worklog?.timeSpentSeconds ?? 0);
  const currentRemaining = tt.remainingEstimateSeconds ?? 0;
  const amountSeconds = parseDuration(amount, timeConfig) ?? 0;
  const previewRemaining =
    adjust === "auto"
      ? Math.max(currentRemaining - delta, 0)
      : adjust === "new"
        ? amountSeconds
        : adjust === "manual"
          ? Math.max(currentRemaining - amountSeconds, 0)
          : currentRemaining;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!issueKey) return setError("Choose an issue to log work on.");
    if (!spentSeconds) return setError(`Invalid time spent. ${FORMAT_HINT}`);
    const startedDate = new Date(started);
    if (Number.isNaN(startedDate.getTime())) return setError("Invalid start date.");
    const adj = adjustment(adjust, amount, timeConfig);
    if (typeof adj === "string") return setError(adj);

    setSaving(true);
    setError(null);
    try {
      const input = { timeSpentSeconds: spentSeconds, started: startedDate, comment: textToAdf(comment) };
      if (worklog) await updateWorklog(issueKey, worklog.id, input, adj);
      else await addWorklog(issueKey, input, adj);
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={worklog ? "Edit work log" : "Log work"}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="log-work-form" disabled={saving}>
            {saving ? <Spinner className="border-white border-t-transparent" /> : "Save"}
          </Button>
        </>
      }
    >
      <form id="log-work-form" onSubmit={submit} className="space-y-4">
        {issueKey ? (
          <div className="flex items-center gap-2 rounded-[3px] bg-surface px-3 py-2 text-sm">
            {issue.data ? <IssueTypeIcon type={issue.data.fields.issuetype} /> : <Spinner />}
            <span className="font-medium text-subtle">{issueKey}</span>
            <span className="truncate">{issue.data?.fields.summary}</span>
            {!initialKey && !worklog && (
              <button type="button" className="ml-auto shrink-0 text-xs text-brand hover:underline" onClick={() => setIssueKey(undefined)}>
                Change
              </button>
            )}
          </div>
        ) : (
          <Field label="Issue" required>
            <IssuePicker autoFocus onSelect={(i) => setIssueKey(i.key)} />
          </Field>
        )}
        <ErrorBanner error={issue.error} />

        {issue.data && (
          <TimeTrackingBar
            spent={(tt.timeSpentSeconds ?? 0) + delta}
            remaining={previewRemaining}
            original={tt.originalEstimateSeconds}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Time spent" required hint={FORMAT_HINT}>
            <input
              className={`${inputClass} ${spent && spentSeconds === null ? "!border-danger" : ""}`}
              value={spent}
              onChange={(e) => setSpent(e.target.value)}
              placeholder="e.g. 2h 30m"
              autoFocus={!!issueKey}
            />
          </Field>
          <Field label="Date started" required>
            <input type="datetime-local" className={inputClass} value={started} onChange={(e) => setStarted(e.target.value)} />
          </Field>
        </div>

        <AdjustEstimateField
          value={adjust}
          onChange={setAdjust}
          amount={amount}
          onAmountChange={setAmount}
          options={
            worklog
              ? { auto: "Adjust automatically", leave: "Leave estimate unchanged", new: "Set to" }
              : { auto: "Adjust automatically", leave: "Leave estimate unchanged", new: "Set to", manual: "Reduce by" }
          }
        />

        <Field label="Work description">
          <textarea
            className={`${inputClass} h-24 resize-y py-1.5`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What did you work on?"
          />
        </Field>
        <ErrorBanner error={error} />
      </form>
    </Modal>
  );
}

export function DeleteWorklogDialog({
  issueKey,
  worklog,
  onClose,
  onDeleted,
}: {
  issueKey: string;
  worklog: Worklog;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { timeConfig } = useSession();
  const [adjust, setAdjust] = useState<AdjustEstimate>("auto");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    const adj = adjustment(adjust, amount, timeConfig);
    if (typeof adj === "string") return setError(adj);
    setBusy(true);
    try {
      await deleteWorklog(issueKey, worklog.id, adj);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Delete work log?"
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>
            Delete
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          This removes <b>{formatDuration(worklog.timeSpentSeconds, timeConfig)}</b> logged on{" "}
          <b>{issueKey}</b>. You can&apos;t undo this.
        </p>
        <AdjustEstimateField
          value={adjust}
          onChange={setAdjust}
          amount={amount}
          onAmountChange={setAmount}
          options={{ auto: "Adjust automatically", leave: "Leave estimate unchanged", new: "Set to", manual: "Increase by" }}
        />
        <ErrorBanner error={error} />
      </div>
    </Modal>
  );
}

export function EstimatesDialog({ issue, onClose, onSaved }: { issue: Issue; onClose: () => void; onSaved: () => void }) {
  const { timeConfig } = useSession();
  const tt = issue.fields.timetracking ?? {};
  const [original, setOriginal] = useState(tt.originalEstimate ?? "");
  const [remaining, setRemaining] = useState(tt.remainingEstimate ?? "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    for (const [label, v] of [
      ["original estimate", original],
      ["remaining estimate", remaining],
    ]) {
      if (v.trim() && parseDuration(v, timeConfig) === null) return setError(`Invalid ${label}. ${FORMAT_HINT}`);
    }
    setBusy(true);
    try {
      await updateEstimates(issue.key, {
        originalEstimate: original.trim() || undefined,
        remainingEstimate: remaining.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Time tracking"
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="estimates-form" disabled={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="estimates-form" onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <JiraIcon src={issue.fields.issuetype?.iconUrl} alt="" />
          <span className="font-medium text-subtle">{issue.key}</span>
          <span className="truncate">{issue.fields.summary}</span>
        </div>
        <TimeTrackingBar
          spent={tt.timeSpentSeconds ?? 0}
          remaining={parseDuration(remaining, timeConfig) ?? tt.remainingEstimateSeconds ?? 0}
          original={parseDuration(original, timeConfig) ?? undefined}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Original estimate" hint={FORMAT_HINT}>
            <input className={inputClass} value={original} onChange={(e) => setOriginal(e.target.value)} autoFocus />
          </Field>
          <Field label="Time remaining">
            <input className={inputClass} value={remaining} onChange={(e) => setRemaining(e.target.value)} />
          </Field>
        </div>
        <ErrorBanner error={error} />
      </form>
    </Modal>
  );
}
