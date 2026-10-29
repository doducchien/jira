"use client";

import { useEffect, useRef, useState } from "react";
import { pickIssues, searchUsers } from "@/lib/jira/api";
import type { JiraUser, PickerIssue } from "@/lib/jira/types";
import { Avatar, JiraIcon, Spinner, inputClass } from "./ui";

export function useDebounced<T>(value: T, ms = 250): T {
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
  search = searchUsers,
  autoFocus,
}: {
  onSelect: (user: JiraUser) => void;
  placeholder?: string;
  exclude?: string[];
  search?: (query: string) => Promise<JiraUser[]>;
  autoFocus?: boolean;
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
    search(debounced)
      .catch(() => [])
      .then((users) => !cancelled && setResult({ query: debounced, users }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, open]);

  const visible = debounced ? (result?.users ?? []).filter((u) => !exclude.includes(u.accountId)) : [];

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

export type Option = { value: string; label: string; icon?: string; hint?: string };

/** Jira-style filter button ("Project ▾") with a searchable checkbox list. */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  loading,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useClickOutside(() => setOpen(false));
  const q = query.trim().toLowerCase();
  const visible = options.filter((o) => !q || o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q));
  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label);

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-8 max-w-[260px] items-center gap-1 rounded-[3px] px-3 text-sm font-medium ${
          value.length ? "bg-brand-subtle text-brand ring-1 ring-brand" : "bg-[#091e420f] text-ink hover:bg-[#091e4224]"
        }`}
      >
        <span className="truncate">
          {label}
          {value.length > 0 && `: ${selectedLabels.length <= 2 ? selectedLabels.join(", ") : `${selectedLabels.length} selected`}`}
        </span>
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-[3px] bg-white shadow-lg ring-1 ring-line">
          <div className="p-2">
            <input className={`${inputClass} h-8`} placeholder={`Search ${label.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </div>
          <div className="max-h-72 overflow-y-auto pb-1">
            {loading && !options.length && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-subtle">
                <Spinner /> Loading…
              </div>
            )}
            {!loading && !visible.length && <div className="px-3 py-2 text-sm text-subtle">No matches</div>}
            {visible.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-hover">
                <input type="checkbox" className="accent-brand" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
                {o.icon && <JiraIcon src={o.icon} alt="" />}
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="ml-auto shrink-0 text-xs text-faint">{o.hint}</span>}
              </label>
            ))}
          </div>
          {value.length > 0 && (
            <div className="border-t border-line px-3 py-2">
              <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => onChange([])}>
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
