"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { IssueTable } from "@/components/issue-table";
import { MultiSelect, UserPicker, useDebounced, type Option } from "@/components/pickers";
import { Avatar, Button, ErrorBanner, Spinner, inputClass } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { ISSUE_LIST_FIELDS, countIssues, getAllProjects, getIssueTypes, searchIssues } from "@/lib/jira/api";
import type { Issue, JiraUser, SearchResponse } from "@/lib/jira/types";
import { useAsync } from "@/lib/use-async";

const PRESETS = [
  { label: "My open issues", jql: "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC" },
  { label: "Logged by me this week", jql: "worklogAuthor = currentUser() AND worklogDate >= startOfWeek() ORDER BY updated DESC" },
  { label: "Open sprints", jql: "sprint in openSprints() ORDER BY updated DESC" },
  { label: "Open epics", jql: "issuetype = Epic AND statusCategory != Done ORDER BY updated DESC" },
  { label: "Over estimate", jql: "remainingEstimate = 0 AND timespent > 0 AND statusCategory != Done ORDER BY updated DESC" },
  { label: "No estimate", jql: "originalEstimate is EMPTY AND statusCategory != Done AND issuetype not in (Epic) ORDER BY updated DESC" },
  { label: "Recently viewed", jql: "issue in issueHistory() ORDER BY lastViewed DESC" },
];

const STATUS_CATEGORIES: Option[] = [
  { value: "To Do", label: "To Do" },
  { value: "In Progress", label: "In Progress" },
  { value: "Done", label: "Done" },
];

const SORTS = [
  { value: "updated DESC", label: "Last updated" },
  { value: "created DESC", label: "Newest created" },
  { value: "priority DESC, updated DESC", label: "Priority" },
  { value: "key ASC", label: "Key" },
  { value: "duedate ASC", label: "Due date" },
];

type Filters = {
  text: string;
  projects: string[];
  types: string[];
  categories: string[];
  assignee: "any" | "me" | "none" | "user";
  assigneeUser?: JiraUser;
  sort: string;
};

const quote = (s: string) => `"${s.replace(/(["\\])/g, "\\$1")}"`;
const list = (values: string[]) => values.map(quote).join(", ");

function buildJql(f: Filters): string {
  const clauses: string[] = [];
  if (f.projects.length) clauses.push(`project in (${list(f.projects)})`);
  if (f.types.length) clauses.push(`issuetype in (${list(f.types)})`);
  if (f.categories.length) clauses.push(`statusCategory in (${list(f.categories)})`);
  if (f.assignee === "me") clauses.push("assignee = currentUser()");
  if (f.assignee === "none") clauses.push("assignee is EMPTY");
  if (f.assignee === "user" && f.assigneeUser) clauses.push(`assignee = ${quote(f.assigneeUser.accountId)}`);
  const text = f.text.trim();
  if (/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(text)) clauses.push(`issuekey = ${quote(text.toUpperCase())}`);
  else if (text) clauses.push(`text ~ ${quote(text)}`);
  // The /search/jql endpoint rejects unbounded queries, so "everything" needs a no-op restriction.
  if (!clauses.length) clauses.push(`created >= "1970-01-01"`);
  return `${clauses.join(" AND ")} ORDER BY ${f.sort}`;
}

const withoutOrder = (jql: string) => jql.replace(/\s+ORDER\s+BY[\s\S]*$/i, "");

export default function IssuesPage() {
  return (
    <Suspense
      fallback={
        <div className="px-8 py-6">
          <Spinner />
        </div>
      }
    >
      <IssueBrowser />
    </Suspense>
  );
}

function IssueBrowser() {
  const params = useSearchParams();
  const { version } = useWorkspace();
  const [mode, setMode] = useState<"basic" | "jql">("basic");
  const [filters, setFilters] = useState<Filters>(() => ({
    text: "",
    projects: params.getAll("project"),
    types: params.getAll("type"),
    categories: [],
    assignee: "any",
    sort: "updated DESC",
  }));
  const [jqlDraft, setJqlDraft] = useState("");
  const [customJql, setCustomJql] = useState("");

  const debouncedText = useDebounced(filters.text, 400);
  const jql = mode === "jql" ? customJql : buildJql({ ...filters, text: debouncedText });

  const projects = useAsync(getAllProjects, []);
  const issueTypes = useAsync(getIssueTypes, []);

  const projectOptions: Option[] = (projects.data ?? []).map((p) => ({
    value: p.key,
    label: p.name,
    hint: p.key,
    icon: p.avatarUrls?.["16x16"],
  }));
  // Team-managed spaces each define their own "Task", "Epic"… — show each name once.
  const typeOptions: Option[] = [];
  for (const t of [...(issueTypes.data ?? [])].sort(
    (a, b) => (b.hierarchyLevel ?? 0) - (a.hierarchyLevel ?? 0) || a.name.localeCompare(b.name),
  )) {
    if (!typeOptions.some((o) => o.value === t.name)) typeOptions.push({ value: t.name, label: t.name, icon: t.iconUrl });
  }

  const first = useAsync(() => searchIssues(jql, ISSUE_LIST_FIELDS, undefined, 100), [jql, version]);
  const count = useAsync(() => countIssues(withoutOrder(jql)), [jql, version]);
  // Pages fetched via "Load more", tied to the first page they continue from.
  const [more, setMore] = useState<{ base?: SearchResponse; issues: Issue[]; nextToken?: string }>({ issues: [] });
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);

  const extended = first.data && more.base === first.data;
  const issues = [...(first.data?.issues ?? []), ...(extended ? more.issues : [])];
  const nextToken = extended ? more.nextToken : first.data?.isLast ? undefined : first.data?.nextPageToken;
  const loading = first.loading || moreLoading;
  const error = first.error ?? moreError;

  async function loadMore(all: boolean) {
    if (!nextToken || !first.data) return;
    const base = first.data;
    setMoreLoading(true);
    setMoreError(null);
    try {
      let token: string | undefined = nextToken;
      let fetched = 0;
      do {
        const page = await searchIssues(jql, ISSUE_LIST_FIELDS, token, 100);
        fetched += page.issues.length;
        token = page.isLast ? undefined : page.nextPageToken;
        setMore((prev) => ({
          base,
          issues: [...(prev.base === base ? prev.issues : []), ...page.issues],
          nextToken: token,
        }));
      } while (all && token && fetched < 5000);
    } catch (err) {
      setMoreError(err);
    } finally {
      setMoreLoading(false);
    }
  }

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  function runJql(e: FormEvent) {
    e.preventDefault();
    setCustomJql(jqlDraft.trim());
  }

  function switchToJql(value = buildJql(filters)) {
    setMode("jql");
    setJqlDraft(value);
    setCustomJql(value);
  }

  const hasFilters =
    filters.text || filters.projects.length || filters.types.length || filters.categories.length || filters.assignee !== "any";

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-medium">Issues</h1>
        <div className="ml-auto flex rounded-[3px] ring-1 ring-line">
          <button
            type="button"
            onClick={() => setMode("basic")}
            className={`px-3 py-1 text-sm font-medium ${mode === "basic" ? "bg-brand-subtle text-brand" : "text-subtle hover:bg-hover"}`}
          >
            Basic
          </button>
          <button
            type="button"
            onClick={() => switchToJql()}
            className={`px-3 py-1 text-sm font-medium ${mode === "jql" ? "bg-brand-subtle text-brand" : "text-subtle hover:bg-hover"}`}
          >
            JQL
          </button>
        </div>
      </div>

      {mode === "basic" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} h-8 w-64`}
            placeholder="Search issues or enter a key"
            value={filters.text}
            onChange={(e) => set({ text: e.target.value })}
          />
          <MultiSelect label="Space" options={projectOptions} value={filters.projects} onChange={(projects) => set({ projects })} loading={projects.loading} />
          <MultiSelect label="Type" options={typeOptions} value={filters.types} onChange={(types) => set({ types })} loading={issueTypes.loading} />
          <MultiSelect label="Status" options={STATUS_CATEGORIES} value={filters.categories} onChange={(categories) => set({ categories })} />
          <select
            className={`h-8 rounded-[3px] px-2 text-sm font-medium outline-none ${
              filters.assignee !== "any" ? "bg-brand-subtle text-brand ring-1 ring-brand" : "bg-[#091e420f]"
            }`}
            value={filters.assignee}
            onChange={(e) => set({ assignee: e.target.value as Filters["assignee"] })}
          >
            <option value="any">Assignee: Anyone</option>
            <option value="me">Assignee: Me</option>
            <option value="none">Assignee: Unassigned</option>
            <option value="user">Assignee: Pick someone…</option>
          </select>
          {filters.assignee === "user" &&
            (filters.assigneeUser ? (
              <span className="flex items-center gap-1.5 rounded-full bg-surface py-0.5 pl-0.5 pr-2 text-sm ring-1 ring-line">
                <Avatar user={filters.assigneeUser} size={20} />
                {filters.assigneeUser.displayName}
                <button type="button" className="text-subtle hover:text-danger" onClick={() => set({ assigneeUser: undefined })} aria-label="Clear">
                  ✕
                </button>
              </span>
            ) : (
              <div className="w-56">
                <UserPicker placeholder="Search assignee" onSelect={(u) => set({ assigneeUser: u })} />
              </div>
            ))}
          <select className="h-8 rounded-[3px] bg-[#091e420f] px-2 text-sm font-medium outline-none" value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              className="text-sm font-medium text-subtle hover:underline"
              onClick={() => setFilters({ text: "", projects: [], types: [], categories: [], assignee: "any", sort: filters.sort })}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={runJql} className="mt-4 flex gap-2">
          <input
            className={`${inputClass} font-mono`}
            value={jqlDraft}
            onChange={(e) => setJqlDraft(e.target.value)}
            placeholder='e.g. project = ABC AND issuetype = Story ORDER BY updated DESC'
            spellCheck={false}
            autoFocus
          />
          <Button variant="primary" type="submit" className="h-9">
            Search
          </Button>
        </form>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-subtle">Quick filters:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => switchToJql(p.jql)}
            className={`rounded-[3px] px-2 py-0.5 text-xs font-medium ${
              mode === "jql" && customJql === p.jql ? "bg-brand-subtle text-brand ring-1 ring-brand" : "bg-surface text-subtle ring-1 ring-line hover:bg-hover"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <ErrorBanner error={error} />
        <div className="flex items-center gap-3 text-sm text-subtle">
          {loading && <Spinner />}
          {first.data && (
            <span>
              Showing <b className="text-ink">{issues.length}</b>
              {count.data !== undefined && (
                <>
                  {" "}
                  of ~<b className="text-ink">{count.data.toLocaleString()}</b>
                </>
              )}{" "}
              issues
            </span>
          )}
        </div>
        {issues.length > 0 && <IssueTable issues={issues} />}
        {!loading && !error && !issues.length && <p className="py-6 text-sm text-subtle">No issues match this search.</p>}
        {nextToken && (
          <div className="flex items-center gap-2">
            <Button onClick={() => loadMore(false)} disabled={loading}>
              Load 100 more
            </Button>
            <Button variant="subtle" onClick={() => loadMore(true)} disabled={loading}>
              Load all
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
