# Worklog for Jira

A Jira Cloud client focused on time tracking, built on the [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/).

## Run

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Sign in with your site (`your-company.atlassian.net`), your Atlassian email and an
[API token](https://id.atlassian.com/manage-profile/security/api-tokens).
Credentials are kept in an HTTP-only cookie and every Jira call goes through
`/api/jira/*` on this server (Jira Cloud doesn't allow browser CORS).

## Features

- **Your work** – time logged today / this week / this month against the expected hours, a clickable week strip, and Worked on / Viewed / Assigned lists.
- **Issues** – JQL search with presets and estimate / logged / remaining columns.
- **Issue view** – description, comments, status transitions, time-tracking bar, editable estimates, full work log with edit / delete.
- **Log work** – Jira duration syntax (`2w 4d 6h 45m`), start date/time, description, and remaining-estimate handling (auto / leave / set to / reduce by).
- **Timesheet** – week or month grid of issues × days for you or a colleague; click an empty cell to log time, a filled cell to edit its worklogs.
- **Reports** – worklogs for a date range, people and JQL filter, grouped by issue / user / day / project, with CSV export.
