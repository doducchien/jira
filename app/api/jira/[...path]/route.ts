import type { NextRequest } from "next/server";
import { getSession, jiraHeaders } from "@/lib/jira/session";

/** Forwards /api/jira/<path> to https://<site>/rest/api/3/<path> using the session cookie. */
async function proxy(request: NextRequest, ctx: RouteContext<"/api/jira/[...path]">) {
  const session = await getSession();
  if (!session) {
    return Response.json({ errorMessages: ["Not signed in"] }, { status: 401 });
  }

  const { path } = await ctx.params;
  const target = `https://${session.site}/rest/api/3/${path
    .map(encodeURIComponent)
    .join("/")}${request.nextUrl.search}`;

  const headers = jiraHeaders(session);
  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
    if (body) headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(target, { method: request.method, headers, body, cache: "no-store" });
  } catch {
    return Response.json(
      { errorMessages: [`Cannot reach ${session.site}`] },
      { status: 502 },
    );
  }

  if (res.status === 204) return new Response(null, { status: 204 });
  return new Response(await res.arrayBuffer(), {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
