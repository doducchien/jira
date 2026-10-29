"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Issue, Worklog } from "@/lib/jira/types";
import { CreateChildDialog } from "./create-child";
import { DeleteWorklogDialog, EstimatesDialog, LogWorkDialog } from "./log-work-dialog";
import { IssueView } from "./issue-view";

type Dialog =
  | { kind: "log"; issueKey?: string; date?: Date; worklog?: Worklog }
  | { kind: "delete"; issueKey: string; worklog: Worklog }
  | { kind: "estimates"; issue: Issue }
  | { kind: "create-child"; parent: Issue; summary?: string; typeId?: string };

type WorkspaceValue = {
  /** Bumped after any write so every view can refetch. */
  version: number;
  changed: () => void;
  openIssue: (key: string) => void;
  logWork: (opts?: { issueKey?: string; date?: Date }) => void;
  editWorklog: (issueKey: string, worklog: Worklog) => void;
  deleteWorklog: (issueKey: string, worklog: Worklog) => void;
  editEstimates: (issue: Issue) => void;
  createChild: (parent: Issue, opts?: { summary?: string; typeId?: string }) => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [issueKey, setIssueKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const closeIssue = useCallback(() => setIssueKey(null), []);

  const value = useMemo<WorkspaceValue>(
    () => ({
      version,
      changed,
      openIssue: (key) => setIssueKey(key.toUpperCase()),
      logWork: (opts) => setDialog({ kind: "log", ...opts }),
      editWorklog: (key, worklog) => setDialog({ kind: "log", issueKey: key, worklog }),
      deleteWorklog: (key, worklog) => setDialog({ kind: "delete", issueKey: key, worklog }),
      editEstimates: (issue) => setDialog({ kind: "estimates", issue }),
      createChild: (parent, opts) => setDialog({ kind: "create-child", parent, ...opts }),
    }),
    [version, changed],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {issueKey && <IssueView issueKey={issueKey} onClose={closeIssue} />}
      {dialog?.kind === "log" && (
        <LogWorkDialog
          issueKey={dialog.issueKey}
          date={dialog.date}
          worklog={dialog.worklog}
          onClose={closeDialog}
          onSaved={changed}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteWorklogDialog issueKey={dialog.issueKey} worklog={dialog.worklog} onClose={closeDialog} onDeleted={changed} />
      )}
      {dialog?.kind === "create-child" && (
        <CreateChildDialog
          parent={dialog.parent}
          initialSummary={dialog.summary}
          initialTypeId={dialog.typeId}
          onClose={closeDialog}
          onCreated={changed}
        />
      )}
      {dialog?.kind === "estimates" && <EstimatesDialog issue={dialog.issue} onClose={closeDialog} onSaved={changed} />}
    </WorkspaceContext.Provider>
  );
}
