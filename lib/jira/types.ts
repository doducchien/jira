export type AdfNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: AdfNode[];
  version?: number;
};

export type JiraUser = {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls?: Record<string, string>;
  active?: boolean;
  timeZone?: string;
  accountType?: string;
};

export type IssueType = { id: string; name: string; iconUrl?: string; subtask?: boolean };

export type Status = {
  id: string;
  name: string;
  statusCategory?: { key: string; colorName: string; name: string };
};

export type Priority = { id: string; name: string; iconUrl?: string };

export type Project = {
  id: string;
  key: string;
  name: string;
  avatarUrls?: Record<string, string>;
};

export type TimeTracking = {
  originalEstimate?: string;
  remainingEstimate?: string;
  timeSpent?: string;
  originalEstimateSeconds?: number;
  remainingEstimateSeconds?: number;
  timeSpentSeconds?: number;
};

export type Worklog = {
  id: string;
  issueId: string;
  author?: JiraUser;
  updateAuthor?: JiraUser;
  comment?: AdfNode;
  created: string;
  updated: string;
  started: string;
  timeSpent: string;
  timeSpentSeconds: number;
};

export type WorklogPage = {
  startAt: number;
  maxResults: number;
  total: number;
  worklogs: Worklog[];
};

export type Comment = {
  id: string;
  author?: JiraUser;
  body?: AdfNode;
  created: string;
  updated: string;
};

export type IssueFields = {
  summary: string;
  description?: AdfNode | null;
  issuetype?: IssueType;
  status?: Status;
  priority?: Priority | null;
  project?: Project;
  assignee?: JiraUser | null;
  reporter?: JiraUser | null;
  parent?: { key: string; fields?: { summary?: string; issuetype?: IssueType } };
  created?: string;
  updated?: string;
  duedate?: string | null;
  labels?: string[];
  timetracking?: TimeTracking;
  timespent?: number | null;
  timeoriginalestimate?: number | null;
  timeestimate?: number | null;
  aggregatetimespent?: number | null;
  worklog?: WorklogPage;
  comment?: { comments: Comment[]; total: number };
};

export type Issue = { id: string; key: string; fields: IssueFields };

export type SearchResponse = {
  issues: Issue[];
  nextPageToken?: string;
  isLast?: boolean;
};

export type Transition = { id: string; name: string; to: Status };

export type AdjustEstimate = "auto" | "leave" | "new" | "manual";

export type PickerIssue = { key: string; summaryText: string; img?: string };
