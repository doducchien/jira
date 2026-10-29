"use client";

import { useEffect, useRef, useState } from "react";
import { pickIssues, searchUsers } from "@/lib/jira/api";
import type { JiraUser, PickerIssue } from "@/lib/jira/types";
import { Avatar, JiraIcon, Spinner, inputClass } from "./ui";

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

/** Search-as-you-type over Jira's issue picker (matches keys and summaries; empty query = recent issues). */
export function IssuePicker({
  onSelect,
  placeholder = "Search issues by key or summary",
  autoFocus,
}: {
  onSelect: (issue: PickerIssue) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ query: string; items: PickerIssue[] } | null>(null);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query).trim();
  const ref = useClickOutside(() => setOpen(false));
  const items = result?.items ?? [];
  const loading = result?.query !== debounced;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    pickIssues(debounced)
      .catch(() => [])
      .then((found) => {
        if (cancelled) return;
        setResult({ query: debounced, items: found });
        setActive(0);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const choose = (issue: PickerIssue) => {
    onSelect(issue);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <input
        className={inputClass}
        placeholder={placeholder}
        value={query}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, items.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && items[active]) {
            e.preventDefault();
            choose(items[active]);
          } else return;
          e.preventDefault();
        }}
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-[3px] bg-white py-1 shadow-lg ring-1 ring-line">
          {loading && !items.length && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-subtle">
              <Spinner /> Searching…
            </div>
          )}
          {!loading && !items.length && <div className="px-3 py-2 text-sm text-subtle">No issues found</div>}
          {items.map((issue, i) => (
            <button
              type="button"
              key={issue.key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(issue)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === active ? "bg-brand-subtle" : ""}`}
            >
              <JiraIcon src={issue.img} alt="" />
              <span className="shrink-0 font-medium text-subtle">{issue.key}</span>
              <span className="truncate">{issue.summaryText}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function UserPicker({
  onSelect,
  placeholder = "Search people",
  exclude = [],
}: {
  onSelect: (user: JiraUser) => void;
  placeholder?: string;
  exclude?: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ query: string; users: JiraUser[] } | null>(null);
  const debounced = useDebounced(query).trim();
  const ref = useClickOutside(() => setOpen(false));
  const loading = !!debounced && result?.query !== debounced;

  useEffect(() => {
    if (!open || !debounced) return;
    let cancelled = false;
    searchUsers(debounced)
      .catch(() => [])
      .then((users) => !cancelled && setResult({ query: debounced, users }));
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const visible = debounced ? (result?.users ?? []).filter((u) => !exclude.includes(u.accountId)) : [];

  return (
    <div ref={ref} className="relative">
      <input
        className={inputClass}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && query.trim() && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-[3px] bg-white py-1 shadow-lg ring-1 ring-line">
          {loading && !visible.length && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-subtle">
              <Spinner /> Searching…
            </div>
          )}
          {!loading && !visible.length && <div className="px-3 py-2 text-sm text-subtle">No people found</div>}
          {visible.map((user) => (
            <button
              type="button"
              key={user.accountId}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(user);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-brand-subtle"
            >
              <Avatar user={user} size={20} />
              <span className="truncate">{user.displayName}</span>
              {user.emailAddress && <span className="truncate text-xs text-faint">{user.emailAddress}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
