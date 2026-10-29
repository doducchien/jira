"use client";

import { useState, type FormEvent } from "react";
import { IssueTable } from "@/components/issue-table";
import { Button, ErrorBanner, Spinner, inputClass } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { ISSUE_LIST_FIELDS, searchIssues } from "@/lib/jira/api";
import type { Issue, SearchResponse } from "@/lib/jira/types";
import { useAsync } from "@/lib/use-async";

const PRESETS = [
  { label: "My open issues", jql: "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC" },
  { label: "Logged by me this week", jql: "worklogAuthor = currentUser() AND worklogDate >= startOfWeek() ORDER BY updated DESC" },
  { label: "Open sprint", jql: "sprint in openSprints() AND assignee = currentUser() ORDER BY rank ASC" },
  { label: "Over estimate", jql: "assignee = currentUser() AND remainingEstimate = 0 AND timespent > 0 AND statusCategory != Done ORDER BY updated DESC" },
  { label: "No estimate", jql: "assignee = currentUser() AND originalEstimate is EMPTY AND statusCategory != Done ORDER BY updated DESC" },
  { label: "Recently viewed", jql: "issue in issueHistory() ORDER BY lastViewed DESC" },
];

export default function IssuesPage() {
  const { version } = useWorkspace();
  const [draft, setDraft] = useState(PRESETS[0].jql);
  const [jql, setJql] = useState(PRESETS[0].jql);
  const first = useAsync(() => searchIssues(jql, ISSUE_LIST_FIELDS), [jql, version]);
  // Pages fetched via "Load more", tied to the first page they continue from.
  const [more, setMore] = useState<{ base?: SearchResponse; issues: Issue[]; nextToken?: string }>({ issues: [] });
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);

  const extended = first.data && more.base === first.data;
  const issues = [...(first.data?.issues ?? []), ...(extended ? more.issues : [])];
  const nextToken = extended ? more.nextToken : first.data?.isLast ? undefined : first.data?.nextPageToken;
  const loading = first.loading || moreLoading;
  const error = first.error ?? moreError;

  async function loadMore() {
    if (!nextToken || !first.data) return;
    const base = first.data;
    setMoreLoading(true);
    setMoreError(null);
    try {
      const page = await searchIssues(jql, ISSUE_LIST_FIELDS, nextToken);
      setMore((prev) => ({
        base,
        issues: [...(prev.base === base ? prev.issues : []), ...page.issues],
        nextToken: page.isLast ? undefined : page.nextPageToken,
      }));
    } catch (err) {
      setMoreError(err);
    } finally {
      setMoreLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setJql(draft.trim());
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <h1 className="text-2xl font-medium">Issues</h1>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          className={`${inputClass} font-mono`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder='e.g. project = ABC AND worklogDate >= "2026-10-01"'
          spellCheck={false}
        />
        <Button variant="primary" type="submit" className="h-9">
          Search
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setDraft(p.jql);
              setJql(p.jql);
            }}
            className={`rounded-[3px] px-2 py-1 text-xs font-medium ${
              jql === p.jql ? "bg-brand-subtle text-brand ring-1 ring-brand" : "bg-surface text-subtle ring-1 ring-line hover:bg-hover"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <ErrorBanner error={error} />
        {issues.length > 0 && <IssueTable issues={issues} />}
        {!loading && !error && !issues.length && <p className="py-6 text-sm text-subtle">No issues match this search.</p>}
        <div className="flex items-center gap-3">
          {loading && <Spinner />}
          {!loading && nextToken && <Button onClick={loadMore}>Load more</Button>}
          {issues.length > 0 && <span className="text-xs text-faint">{issues.length} issues shown</span>}
        </div>
      </div>
    </div>
  );
}
