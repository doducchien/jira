"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { IssueType, JiraUser, Status } from "@/lib/jira/types";
import { useSession } from "./session";

type Variant = "primary" | "default" | "subtle" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  default: "bg-[#091e420f] text-ink hover:bg-[#091e4224]",
  subtle: "bg-transparent text-subtle hover:bg-hover",
  danger: "bg-danger text-white hover:bg-[#ae2e24]",
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[3px] px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export const inputClass =
  "h-9 w-full rounded-[3px] border-2 border-line bg-surface px-2 text-sm outline-none hover:bg-[#f1f2f4] focus:border-brand focus:bg-white";

export function Field({ label, hint, required, children }: { label: string; hint?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-subtle">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

/** Routes Jira-hosted image URLs through our authenticated asset proxy. */
export function useAssetUrl() {
  const { site } = useSession();
  return (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith("/")) return `/api/jira-asset?url=${encodeURIComponent(url)}`;
    try {
      return new URL(url).hostname === site ? `/api/jira-asset?url=${encodeURIComponent(url)}` : url;
    } catch {
      return undefined;
    }
  };
}

export function JiraIcon({ src, alt, size = 16 }: { src?: string; alt: string; size?: number }) {
  const asset = useAssetUrl();
  const url = asset(src);
  if (!url) return <span className="inline-block shrink-0 rounded-sm bg-line" style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} title={alt} width={size} height={size} className="shrink-0" />;
}

export function IssueTypeIcon({ type }: { type?: IssueType }) {
  return <JiraIcon src={type?.iconUrl} alt={type?.name ?? "Issue"} />;
}

export function Avatar({ user, size = 24 }: { user?: JiraUser | null; size?: number }) {
  const asset = useAssetUrl();
  if (!user) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-line text-[10px] text-subtle"
        style={{ width: size, height: size }}
        title="Unassigned"
      >
        ?
      </span>
    );
  }
  const src = asset(user.avatarUrls?.["48x48"] ?? user.avatarUrls?.["24x24"]);
  if (!src) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white"
        style={{ width: size, height: size }}
        title={user.displayName}
      >
        {user.displayName.slice(0, 1)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={user.displayName} title={user.displayName} width={size} height={size} className="shrink-0 rounded-full" />;
}

const LOZENGE: Record<string, string> = {
  "blue-gray": "bg-[#dcdfe4] text-[#44546f]",
  "medium-gray": "bg-[#dcdfe4] text-[#44546f]",
  yellow: "bg-[#cce0ff] text-[#0055cc]",
  green: "bg-[#baf3db] text-[#216e4e]",
};

export function StatusLozenge({ status }: { status?: Status }) {
  if (!status) return null;
  const color = LOZENGE[status.statusCategory?.colorName ?? ""] ?? LOZENGE["blue-gray"];
  return (
    <span className={`inline-block max-w-[160px] truncate rounded-[3px] px-1 text-[11px] font-bold uppercase leading-4 ${color}`}>
      {status.name}
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent ${className}`}
      aria-label="Loading"
    />
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="rounded-[3px] border-l-4 border-danger bg-[#ffeceb] px-3 py-2 text-sm text-[#ae2e24]">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = "max-w-lg",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most modal reacts to Escape.
      const modals = document.querySelectorAll("[data-modal]");
      if (e.key === "Escape" && modals[modals.length - 1] === ref.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#091e427a] px-4 py-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={ref} data-modal className={`w-full ${width} rounded-[3px] bg-white shadow-xl`} role="dialog" aria-modal>
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="text-xl font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-subtle hover:bg-hover" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="px-6 py-3">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 pb-5 pt-2">{footer}</div>}
      </div>
    </div>
  );
}
