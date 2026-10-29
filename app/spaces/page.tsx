"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, ErrorBanner, JiraIcon, Spinner, inputClass } from "@/components/ui";
import { getAllProjects } from "@/lib/jira/api";
import { useAsync } from "@/lib/use-async";

const TYPE_LABELS: Record<string, string> = {
  software: "Software",
  service_desk: "Service management",
  business: "Business",
  product_discovery: "Product discovery",
};

/** Every project ("space") the signed-in user can browse. */
export default function SpacesPage() {
  const projects = useAsync(getAllProjects, []);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = (projects.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q));

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-medium">Spaces</h1>
        {projects.data && <span className="text-sm text-subtle">{projects.data.length} spaces you can access</span>}
      </div>
      <input className={`${inputClass} mt-4 w-72`} placeholder="Search spaces" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="mt-4">
        <ErrorBanner error={projects.error} />
        {projects.loading && !projects.data && <Spinner />}
      </div>

      {visible.length > 0 && (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-line text-left text-xs font-semibold text-subtle">
              <th className="py-2 pl-2">Name</th>
              <th className="w-28 py-2">Key</th>
              <th className="w-48 py-2">Type</th>
              <th className="w-56 py-2">Lead</th>
              <th className="w-72 py-2">Browse</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const epicType = p.issueTypes?.find((t) => t.hierarchyLevel === 1)?.name;
              const href = (type?: string) =>
                `/issues?project=${encodeURIComponent(p.key)}${type ? `&type=${encodeURIComponent(type)}` : ""}`;
              return (
                <tr key={p.id} className="border-b border-line hover:bg-surface">
                  <td className="py-2 pl-2">
                    <Link href={href()} className="flex items-center gap-2 font-medium text-brand hover:underline">
                      <JiraIcon src={p.avatarUrls?.["24x24"]} alt="" size={24} />
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2">{p.key}</td>
                  <td className="py-2 text-subtle">
                    {TYPE_LABELS[p.projectTypeKey ?? ""] ?? p.projectTypeKey}
                    {p.style === "next-gen" && " · team-managed"}
                  </td>
                  <td className="py-2">
                    {p.lead && (
                      <span className="flex items-center gap-2">
                        <Avatar user={p.lead} size={20} />
                        <span className="truncate">{p.lead.displayName}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <span className="flex flex-wrap gap-2 text-xs font-medium">
                      <Link href={href()} className="rounded-[3px] bg-surface px-2 py-0.5 ring-1 ring-line hover:bg-hover">
                        All issues
                      </Link>
                      {epicType && (
                        <Link href={href(epicType)} className="rounded-[3px] bg-surface px-2 py-0.5 ring-1 ring-line hover:bg-hover">
                          {epicType}s
                        </Link>
                      )}
                      {p.issueTypes?.some((t) => t.name === "Story") && (
                        <Link href={href("Story")} className="rounded-[3px] bg-surface px-2 py-0.5 ring-1 ring-line hover:bg-hover">
                          Stories
                        </Link>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {projects.data && !visible.length && <p className="py-6 text-sm text-subtle">No spaces match.</p>}
    </div>
  );
}
