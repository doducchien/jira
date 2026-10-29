import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  encodeSession,
  getSession,
  jiraHeaders,
  normalizeSite,
} from "@/lib/jira/session";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json({ site: session.site, email: session.email });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const site = normalizeSite(String(body.site ?? ""));
  const email = String(body.email ?? "").trim();
  const token = String(body.token ?? "").trim();

  if (!site) {
    return Response.json(
      { error: "Site must be a Jira Cloud URL, e.g. your-company.atlassian.net" },
      { status: 400 },
    );
  }
  if (!email || !token) {
    return Response.json({ error: "Email and API token are required" }, { status: 400 });
  }

  const session = { site, email, token };
  let res: Response;
  try {
    res = await fetch(`https://${site}/rest/api/3/myself`, {
      headers: jiraHeaders(session),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: `Cannot reach ${site}` }, { status: 502 });
  }
  if (!res.ok) {
    const message =
      res.status === 401 || res.status === 403
        ? "Jira rejected these credentials. Check the email and API token."
        : `Jira responded with ${res.status}`;
    return Response.json({ error: message }, { status: 401 });
  }

  const secure = new URL(request.url).protocol === "https:";
  (await cookies()).set({
    name: SESSION_COOKIE,
    value: encodeSession(session),
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.json({ site, email });
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return new Response(null, { status: 204 });
}
