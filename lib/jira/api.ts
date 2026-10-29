import { addDays, parseJiraDate, toJiraDateTime, ymd } from "@/lib/time";
import type {
  AdfNode,
  AdjustEstimate,
  Issue,
  JiraUser,
  PickerIssue,
  SearchResponse,
  Transition,
  Worklog,
  WorklogPage,
} from "./types";

export class JiraError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined>;

async function jira<T>(
  path: string,
  { method = "GET", query, body }: { method?: string; query?: Query; body?: unknown } = {},
): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") params.set(k, String(v));
  const qs = params.size ? `?${params}` : "";
  const res = await fetch(`/api/jira/${path}${qs}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const messages = [
      ...(data?.errorMessages ?? []),
      ...Object.entries(data?.errors ?? {}).map(([field, msg]) => `${field}: ${msg}`),
    ];
    throw new JiraError(messages.join(" ") || `Jira request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const ISSUE_LIST_FIELDS = [
  "summary",
  "issuetype",
  "status",
  "priority",
  "assignee",
  "project",
  "timetracking",
  "timespent",
  "timeoriginalestimate",
  "timeestimate",
  "updated",
];

export const getMyself = () => jira<JiraUser>("myself");

export async function getTimeTrackingConfig() {
  const cfg = await jira<{
    timeTrackingEnabled: boolean;
    timeTrackingConfiguration?: {
      workingHoursPerDay: number;
      workingDaysPerWeek: number;
      defaultUnit: "minute" | "hour" | "day" | "week";
    };
  }>("configuration");
  return cfg.timeTrackingConfiguration;
}

export function searchIssues(jql: string, fields: string[], nextPageToken?: string, maxResults = 50) {
  return jira<SearchResponse>("search/jql", {
    method: "POST",
    body: { jql, fields, maxResults, nextPageToken },
  });
}

export async function searchAllIssues(jql: string, fields: string[], limit = 1000): Promise<Issue[]> {
  const issues: Issue[] = [];
  let token: string | undefined;
  do {
    const page = await searchIssues(jql, fields, token, 100);
    issues.push(...page.issues);
    token = page.isLast ? undefined : page.nextPageToken;
  } while (token && issues.length < limit);
  return issues;
}

export function getIssue(key: string) {
  return jira<Issue>(`issue/${encodeURIComponent(key)}`, {
    query: {
      fields: [...ISSUE_LIST_FIELDS, "description", "reporter", "created", "parent", "labels", "duedate", "comment"].join(","),
    },
  });
}

export async function pickIssues(query: string): Promise<PickerIssue[]> {
  const res = await jira<{ sections: { id: string; issues: PickerIssue[] }[] }>("issue/picker", {
    query: { query, showSubTasks: true, showSubTaskParent: true },
  });
  const seen = new Set<string>();
  return res.sections
    .flatMap((s) => s.issues)
    .filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}

export const searchUsers = (query: string) =>
  jira<JiraUser[]>("user/search", { query: { query, maxResults: 20 } }).then((users) =>
    users.filter((u) => u.accountType !== "app"),
  );

export const getTransitions = (key: string) =>
  jira<{ transitions: Transition[] }>(`issue/${encodeURIComponent(key)}/transitions`).then((r) => r.transitions);

export const doTransition = (key: string, id: string) =>
  jira<void>(`issue/${encodeURIComponent(key)}/transitions`, { method: "POST", body: { transition: { id } } });

export const updateEstimates = (key: string, timetracking: { originalEstimate?: string; remainingEstimate?: string }) =>
  jira<void>(`issue/${encodeURIComponent(key)}`, { method: "PUT", body: { fields: { timetracking } } });

export async function getWorklogs(
  key: string,
  range?: { startedAfter?: number; startedBefore?: number },
): Promise<Worklog[]> {
  const all: Worklog[] = [];
  let startAt = 0;
  for (;;) {
    const page = await jira<WorklogPage>(`issue/${encodeURIComponent(key)}/worklog`, {
      query: { startAt, maxResults: 1000, ...range },
    });
    all.push(...page.worklogs);
    startAt += page.worklogs.length;
    if (!page.worklogs.length || startAt >= page.total) return all;
  }
}

export type WorklogInput = {
  timeSpentSeconds: number;
  started: Date;
  comment?: AdfNode;
};

export type EstimateAdjustment = {
  adjustEstimate: AdjustEstimate;
  /** For "new": the new remaining estimate. For "manual": the amount to reduce (add) / increase (delete) by. */
  value?: string;
};

function adjustQuery(adj: EstimateAdjustment, manualParam: "reduceBy" | "increaseBy"): Query {
  return {
    adjustEstimate: adj.adjustEstimate,
    newEstimate: adj.adjustEstimate === "new" ? adj.value : undefined,
    [manualParam]: adj.adjustEstimate === "manual" ? adj.value : undefined,
  };
}

function worklogBody(input: WorklogInput) {
  return {
    timeSpentSeconds: input.timeSpentSeconds,
    started: toJiraDateTime(input.started),
    comment: input.comment ?? null,
  };
}

export const addWorklog = (key: string, input: WorklogInput, adj: EstimateAdjustment) =>
  jira<Worklog>(`issue/${encodeURIComponent(key)}/worklog`, {
    method: "POST",
    query: adjustQuery(adj, "reduceBy"),
    body: worklogBody(input),
  });

export const updateWorklog = (key: string, id: string, input: WorklogInput, adj: EstimateAdjustment) =>
  jira<Worklog>(`issue/${encodeURIComponent(key)}/worklog/${id}`, {
    method: "PUT",
    query: adjustQuery(adj, "reduceBy"),
    body: worklogBody(input),
  });

export const deleteWorklog = (key: string, id: string, adj: EstimateAdjustment) =>
  jira<void>(`issue/${encodeURIComponent(key)}/worklog/${id}`, {
    method: "DELETE",
    query: adjustQuery(adj, "increaseBy"),
  });

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export type WorklogEntry = { issue: Issue; worklog: Worklog; started: Date };

const quote = (s: string) => `"${s.replace(/(["\\])/g, "\\$1")}"`;

/**
 * Every worklog started within [from, to] (inclusive days, local time), optionally limited
 * to some authors and an extra JQL clause.
 */
export async function getWorklogsInRange(opts: {
  from: Date;
  to: Date;
  accountIds?: string[];
  jql?: string;
}): Promise<WorklogEntry[]> {
  const start = opts.from.getTime();
  const end = addDays(opts.to, 1).getTime();
  // JQL worklogDate uses the Jira profile timezone, so pad by a day and filter precisely below.
  const clauses = [
    `worklogDate >= ${quote(ymd(addDays(opts.from, -1)))}`,
    `worklogDate <= ${quote(ymd(addDays(opts.to, 1)))}`,
  ];
  if (opts.accountIds?.length) clauses.push(`worklogAuthor in (${opts.accountIds.map(quote).join(", ")})`);
  if (opts.jql?.trim()) clauses.push(`(${opts.jql.trim()})`);

  const issues = await searchAllIssues(
    `${clauses.join(" AND ")} ORDER BY key ASC`,
    ["summary", "issuetype", "status", "project", "worklog", "timetracking"],
  );
  const authors = opts.accountIds?.length ? new Set(opts.accountIds) : null;

  const perIssue = await mapLimit(issues, 6, async (issue) => {
    const embedded = issue.fields.worklog;
    const worklogs =
      embedded && embedded.total <= embedded.worklogs.length
        ? embedded.worklogs
        : await getWorklogs(issue.key, { startedAfter: start - 86400000, startedBefore: end + 86400000 });
    return worklogs
      .map((worklog) => ({ issue, worklog, started: parseJiraDate(worklog.started) }))
      .filter(
        (e) =>
          e.started.getTime() >= start &&
          e.started.getTime() < end &&
          (!authors || (e.worklog.author && authors.has(e.worklog.author.accountId))),
      );
  });
  return perIssue.flat().sort((a, b) => a.started.getTime() - b.started.getTime());
}
