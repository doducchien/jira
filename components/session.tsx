"use client";

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { getMyself, getTimeTrackingConfig } from "@/lib/jira/api";
import type { JiraUser } from "@/lib/jira/types";
import { DEFAULT_TIME_CONFIG, type TimeConfig } from "@/lib/time";

type SessionValue = {
  site: string;
  email: string;
  myself: JiraUser;
  timeConfig: TimeConfig;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "ready"; site: string; email: string; myself: JiraUser; timeConfig: TimeConfig };

async function loadSession(): Promise<State> {
  const res = await fetch("/api/session");
  if (!res.ok) return { status: "signed-out" };
  const { site, email } = await res.json();
  const [myself, cfg] = await Promise.all([getMyself(), getTimeTrackingConfig().catch(() => undefined)]);
  return {
    status: "ready",
    site,
    email,
    myself,
    timeConfig: cfg
      ? {
          hoursPerDay: cfg.workingHoursPerDay,
          daysPerWeek: cfg.workingDaysPerWeek,
          defaultUnit: cfg.defaultUnit,
        }
      : DEFAULT_TIME_CONFIG,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(() => {
    loadSession().then(setState, () => setState({ status: "signed-out" }));
  }, []);
  useEffect(refresh, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/session", { method: "DELETE" });
    setState({ status: "signed-out" });
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-subtle">
        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        Connecting to Jira…
      </div>
    );
  }
  if (state.status === "signed-out") return <LoginScreen onSignedIn={refresh} />;

  return <SessionContext.Provider value={{ ...state, logout }}>{children}</SessionContext.Provider>;
}

function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [site, setSite] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site, email, token }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) return onSignedIn();
    setError((await res?.json().catch(() => null))?.error ?? "Sign-in failed");
  }

  const input =
    "h-10 w-full rounded-[3px] border-2 border-line bg-surface px-2 text-sm outline-none focus:border-brand focus:bg-white";

  return (
    <div className="flex flex-1 items-center justify-center bg-surface px-4 py-12">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-[3px] bg-white p-8 shadow-md">
        <div className="flex items-center justify-center gap-2 text-2xl font-semibold text-brand">
          <AppLogo />
          Jira Worklog
        </div>
        <p className="text-center text-sm text-subtle">Connect to your Jira Cloud site</p>
        <label className="block text-xs font-semibold text-subtle">
          Site
          <input className={`${input} mt-1`} placeholder="your-company.atlassian.net" value={site} onChange={(e) => setSite(e.target.value)} required />
        </label>
        <label className="block text-xs font-semibold text-subtle">
          Email
          <input className={`${input} mt-1`} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block text-xs font-semibold text-subtle">
          API token
          <input className={`${input} mt-1`} type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} required />
          <span className="mt-1 block font-normal text-faint">
            Create one at{" "}
            <a className="text-brand hover:underline" href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">
              id.atlassian.com → Security → API tokens
            </a>
          </span>
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="h-10 w-full rounded-[3px] bg-brand text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60">
          {busy ? "Connecting…" : "Continue"}
        </button>
        <p className="text-center text-xs text-faint">
          The token is stored in an HTTP-only cookie on this app&apos;s server and only sent to your Jira site.
        </p>
      </form>
    </div>
  );
}

export function AppLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="5" fill="#0C66E4" />
      <circle cx="12" cy="13" r="6.5" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M12 9.5V13l2.5 1.5M10 3.5h4" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
