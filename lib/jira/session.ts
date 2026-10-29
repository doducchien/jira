import { cookies } from "next/headers";

export const SESSION_COOKIE = "jira_session";

export type Session = { site: string; email: string; token: string };

/** Accepts "acme", "acme.atlassian.net" or a full URL; returns the bare hostname. */
export function normalizeSite(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (!value.includes(".")) value = `${value}.atlassian.net`;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const host = new URL(value).hostname.toLowerCase();
    // Only Jira Cloud sites, so the proxy can't be pointed at arbitrary hosts.
    return host.endsWith(".atlassian.net") ? host : null;
  } catch {
    return null;
  }
}

export function encodeSession(session: Session): string {
  return Buffer.from(JSON.stringify(session)).toString("base64url");
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const site = normalizeSite(String(parsed.site ?? ""));
    if (!site || !parsed.email || !parsed.token) return null;
    return { site, email: String(parsed.email), token: String(parsed.token) };
  } catch {
    return null;
  }
}

export function jiraHeaders(session: Session): Record<string, string> {
  const basic = Buffer.from(`${session.email}:${session.token}`).toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    Accept: "application/json",
    "X-Atlassian-Token": "no-check",
  };
}
