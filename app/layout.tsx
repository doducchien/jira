import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/components/session";
import { WorkspaceProvider } from "@/components/workspace";
import "./globals.css";

export const metadata: Metadata = {
  title: "Worklog for Jira",
  description: "Log and review time on Jira Cloud issues",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SessionProvider>
          <WorkspaceProvider>
            <AppShell>{children}</AppShell>
          </WorkspaceProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
