import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { DashboardSettings } from "@/components/dashboard/dashboard-settings";
import { Button } from "@/components/ui/button";
import { getDashboardForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import { listWidgetsForUser } from "@/lib/widgets";

export const metadata: Metadata = { title: "Dashboard settings" };

export default async function DashboardsPage() {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const profile = await ensureUserRecord(user);
  const widgets = await listWidgetsForUser(profile.id, dashboard.id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="aui-eyebrow">Workspace</p>
          <h1 className="aui-title mt-1 text-xl sm:text-2xl">Dashboard settings</h1>
          <p className="aui-subtitle mt-1 text-[0.8rem]">
            Rename this dashboard, pick its clay portrait and colour, or change the template it
            started from. Switch dashboards from the sidebar picker.
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/dashboard/new" />}
          className="h-9 gap-2 rounded-xl text-[0.8rem]"
        >
          <Plus className="size-3.5" />
          New dashboard
        </Button>
      </header>

      <DashboardSettings
        dashboard={{
          id: dashboard.id,
          name: dashboard.name,
          icon: dashboard.icon,
          color: dashboard.color,
          template: dashboard.template,
        }}
        existingTitles={widgets.map((widget) => widget.title)}
      />
    </div>
  );
}
