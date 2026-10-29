"use client";

import { useState, type FormEvent } from "react";
import { textToAdf } from "@/lib/jira/adf";
import { createIssue, getCreateFields, getCreateIssueTypes, searchAssignableUsers } from "@/lib/jira/api";
import type { Issue, IssueType, JiraUser } from "@/lib/jira/types";
import { parseDuration } from "@/lib/time";
import { useAsync } from "@/lib/use-async";
import { UserPicker } from "./pickers";
import { useSession } from "./session";
import { Avatar, Button, ErrorBanner, Field, JiraIcon, Modal, Spinner, inputClass } from "./ui";

/** Sub-tasks can't have children; epics get standard issues (Story, Task…); everything else gets sub-tasks. */
export function canHaveChildren(parent: Issue): boolean {
  return !parent.fields.issuetype?.subtask;
}

export function isEpic(parent: Issue): boolean {
  return parent.fields.issuetype?.hierarchyLevel === 1;
}

/** Issue types that can be created under `parent`, in Jira's order. */
export function useChildTypes(parent: Issue) {
  const projectKey = parent.fields.project?.key ?? "";
  const epic = isEpic(parent);
  return useAsync(async () => {
    const types = await getCreateIssueTypes(projectKey);
    return types.filter((t: IssueType) => (epic ? !t.subtask && (t.hierarchyLevel ?? 0) === 0 : t.subtask));
  }, [projectKey, epic]);
}

function baseFields(parent: Issue, typeId: string, summary: string): Record<string, unknown> {
  return {
    project: { key: parent.fields.project?.key },
    parent: { key: parent.key },
    issuetype: { id: typeId },
    summary: summary.trim(),
  };
}

function TypeSelect({ types, value, onChange }: { types: IssueType[]; value: string; onChange: (id: string) => void }) {
  const selected = types.find((t) => t.id === value);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <JiraIcon src={selected?.iconUrl} alt={selected?.name ?? ""} />
      <select
        className="h-8 rounded-[3px] bg-transparent px-1 text-sm outline-none hover:bg-hover"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Issue type"
      >
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Jira's inline "What needs to be done?" row under Child issues. Stays open after each create. */
export function InlineCreateChild({
  parent,
  onCreated,
  onCancel,
  onMoreFields,
}: {
  parent: Issue;
  onCreated: () => void;
  onCancel: () => void;
  onMoreFields: (summary: string, typeId?: string) => void;
}) {
  const types = useChildTypes(parent);
  const [typeId, setTypeId] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const effectiveType = typeId || types.data?.[0]?.id || "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!summary.trim() || !effectiveType) return;
    setBusy(true);
    setError(null);
    try {
      await createIssue(baseFields(parent, effectiveType, summary));
      setSummary("");
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (types.data && !types.data.length) {
    return (
      <div className="px-3 py-2">
        <ErrorBanner error={`You can't create ${isEpic(parent) ? "child issues" : "sub-tasks"} in this space.`} />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 px-3 py-2">
      <div className="flex items-center gap-2 rounded-[3px] ring-2 ring-brand">
        {types.data ? (
          <TypeSelect types={types.data} value={effectiveType} onChange={setTypeId} />
        ) : (
          <Spinner className="ml-2" />
        )}
        <input
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
          placeholder="What needs to be done?"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(e) => {
            // preventDefault tells the issue view's Escape handler to leave the issue open.
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          maxLength={255}
          autoFocus
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="subtle" className="mr-auto h-7 text-xs" onClick={() => onMoreFields(summary, effectiveType)}>
          More fields…
        </Button>
        <Button variant="subtle" className="h-7" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" className="h-7" disabled={busy || !summary.trim() || !effectiveType}>
          {busy ? <Spinner className="border-white border-t-transparent" /> : "Create"}
        </Button>
      </div>
      <ErrorBanner error={error} />
    </form>
  );
}

/** Full create dialog for a sub-task / child issue. */
export function CreateChildDialog({
  parent,
  initialSummary = "",
  initialTypeId,
  onClose,
  onCreated,
}: {
  parent: Issue;
  initialSummary?: string;
  initialTypeId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { myself, timeConfig } = useSession();
  const projectKey = parent.fields.project?.key ?? "";
  const types = useChildTypes(parent);
  const [typeId, setTypeId] = useState(initialTypeId ?? "");
  const effectiveType = typeId || types.data?.[0]?.id || "";
  const fields = useAsync(
    () => (effectiveType ? getCreateFields(projectKey, effectiveType) : Promise.resolve(undefined)),
    [projectKey, effectiveType],
  );

  const [summary, setSummary] = useState(initialSummary);
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<JiraUser | null>(null);
  const [estimate, setEstimate] = useState("");
  const [createAnother, setCreateAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Show a field when it's on the create screen (or when the screen couldn't be read).
  const has = (id: string) => !fields.data || fields.data.some((f) => f.fieldId === id || f.key === id);
  const handled = new Set(["project", "issuetype", "parent", "summary", "description", "assignee", "timetracking", "reporter"]);
  const missingRequired = (fields.data ?? []).filter((f) => f.required && !f.hasDefaultValue && !handled.has(f.fieldId));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!summary.trim()) return setError("Summary is required.");
    if (estimate.trim() && parseDuration(estimate, timeConfig) === null) {
      return setError("Invalid original estimate. Use the format: 2w 4d 6h 45m");
    }
    const body = baseFields(parent, effectiveType, summary);
    if (description.trim() && has("description")) body.description = textToAdf(description);
    if (assignee && has("assignee")) body.assignee = { accountId: assignee.accountId };
    if (estimate.trim() && has("timetracking")) body.timetracking = { originalEstimate: estimate.trim() };

    setBusy(true);
    setError(null);
    try {
      await createIssue(body);
      onCreated();
      if (createAnother) {
        setSummary("");
        setDescription("");
        setEstimate("");
        setBusy(false);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const title = isEpic(parent) ? "Create child issue" : "Create sub-task";

  return (
    <Modal
      title={title}
      onClose={onClose}
      width="max-w-xl"
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-sm text-subtle">
            <input type="checkbox" className="accent-brand" checked={createAnother} onChange={(e) => setCreateAnother(e.target.checked)} />
            Create another
          </label>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-child-form" disabled={busy || !effectiveType}>
            {busy ? <Spinner className="border-white border-t-transparent" /> : "Create"}
          </Button>
        </>
      }
    >
      <form id="create-child-form" onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2 rounded-[3px] bg-surface px-3 py-2 text-sm">
          <span className="text-subtle">Parent</span>
          <JiraIcon src={parent.fields.issuetype?.iconUrl} alt="" />
          <span className="font-medium text-subtle">{parent.key}</span>
          <span className="truncate">{parent.fields.summary}</span>
        </div>

        <Field label="Issue type" required>
          {types.data ? (
            types.data.length ? (
              <div className={`${inputClass} flex items-center px-1`}>
                <TypeSelect types={types.data} value={effectiveType} onChange={setTypeId} />
              </div>
            ) : (
              <ErrorBanner error="No sub-task issue types are available in this space." />
            )
          ) : (
            <Spinner />
          )}
        </Field>
        <ErrorBanner error={types.error} />

        <Field label="Summary" required>
          <input className={inputClass} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={255} autoFocus />
        </Field>

        {has("description") && (
          <Field label="Description">
            <textarea className={`${inputClass} h-28 resize-y py-1.5`} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        )}

        {has("assignee") && (
          <Field label="Assignee">
            {assignee ? (
              <span className="flex h-9 items-center gap-2 text-sm">
                <Avatar user={assignee} />
                {assignee.displayName}
                <button type="button" className="text-xs text-brand hover:underline" onClick={() => setAssignee(null)}>
                  Change
                </button>
              </span>
            ) : (
              <div className="space-y-1">
                <UserPicker placeholder="Unassigned — search people" search={(q) => searchAssignableUsers(projectKey, q)} onSelect={setAssignee} />
                <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => setAssignee(myself)}>
                  Assign to me
                </button>
              </div>
            )}
          </Field>
        )}

        {has("timetracking") && (
          <Field label="Original estimate" hint="Use the format: 2w 4d 6h 45m">
            <input className={`${inputClass} max-w-[200px]`} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="e.g. 4h" />
          </Field>
        )}

        {missingRequired.length > 0 && (
          <p className="rounded-[3px] bg-[#fff7d6] px-3 py-2 text-xs text-[#7f5f01]">
            This issue type also requires: {missingRequired.map((f) => f.name).join(", ")}. Jira may reject the create unless they have
            defaults.
          </p>
        )}
        <ErrorBanner error={error} />
      </form>
    </Modal>
  );
}
