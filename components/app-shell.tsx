"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IssuePicker } from "./pickers";
import { AppLogo, useSession } from "./session";
import { Avatar, Button } from "./ui";
import { useWorkspace } from "./workspace";

const NAV = [
  { href: "/", label: "Your work" },
  { href: "/issues", label: "Issues" },
  { href: "/timesheet", label: "Timesheet" },
  { href: "/reports", label: "Reports" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { openIssue, logWork } = useWorkspace();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white px-4">
        <Link href="/" className="mr-3 flex items-center gap-2 text-[15px] font-semibold text-brand">
          <AppLogo />
          Worklog
        </Link>
        <nav className="flex h-full items-center">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex h-full items-center px-3 text-sm font-medium ${
                  active ? "text-brand after:absolute after:inset-x-1 after:bottom-0 after:h-[3px] after:rounded-t after:bg-brand" : "text-subtle hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Button variant="primary" className="ml-2" onClick={() => logWork()}>
          + Log work
        </Button>
        <div className="ml-auto w-72">
          <IssuePicker placeholder="Search or open issue…" onSelect={(i) => openIssue(i.key)} />
        </div>
        <ProfileMenu />
      </header>
      <main className="flex-1 bg-white">{children}</main>
    </div>
  );
}

function ProfileMenu() {
  const { myself, site, logout } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-full p-1 hover:bg-hover" aria-label="Your profile">
        <Avatar user={myself} size={28} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-[3px] bg-white py-2 shadow-lg ring-1 ring-line">
          <div className="flex items-center gap-3 px-4 pb-2">
            <Avatar user={myself} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{myself.displayName}</div>
              <div className="truncate text-xs text-faint">{myself.emailAddress ?? site}</div>
            </div>
          </div>
          <div className="border-t border-line px-4 py-2 text-xs text-faint">
            Connected to{" "}
            <a href={`https://${site}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              {site}
            </a>
          </div>
          <button type="button" onClick={logout} className="w-full px-4 py-2 text-left text-sm hover:bg-hover">
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
