import type { NextRequest } from "next/server";
import { getSession, jiraHeaders } from "@/lib/jira/session";

/** Serves icons/avatars hosted on the Jira site, which need auth and so can't be <img src>'d directly. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });

  const raw = request.nextUrl.searchParams.get("url") ?? "";
  let url: URL;
  try {
    url = new URL(raw, `https://${session.site}`);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (url.protocol !== "https:" || url.hostname !== session.site) {
    return new Response(null, { status: 400 });
  }

  const headers = jiraHeaders(session);
  headers.Accept = "image/*";
  const res = await fetch(url, { headers, cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return new Response(null, { status: res?.status ?? 502 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/png",
      "Cache-Control": "private, max-age=86400",
      // SVG icons are served from our origin; keep them inert if opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
