import Link from "next/link";
import { Plus } from "lucide-react";
import { listAudits } from "@/lib/audit/service";
import { getScoreState } from "@/lib/scoring";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  string,
  "excellent" | "good" | "warning" | "poor" | "critical" | "secondary" | "default"
> = {
  COMPLETED: "good",
  RUNNING: "default",
  QUEUED: "secondary",
  FAILED: "critical",
  CANCELLED: "secondary",
};

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function DashboardPage() {
  const { audits, stats } = await listAudits();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container flex-1 py-10">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Recent website audits and their health scores.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/#analyze">
              <Plus className="size-4" /> New audit
            </Link>
          </Button>
        </div>

        {/* Summary stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total audits</p>
            <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold tabular-nums">{stats.completed}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">In progress</p>
            <p className="text-2xl font-bold tabular-nums">{stats.running}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Average score</p>
            <p className="text-2xl font-bold tabular-nums">
              {stats.averageScore ?? "—"}
            </p>
          </Card>
        </div>

        {/* Audit list */}
        {audits.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No audits yet. Start by analyzing a website.
            </p>
            <Button asChild className="mt-4" size="sm">
              <Link href="/#analyze">Analyze a website</Link>
            </Button>
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {audits.map((a) => {
              const scored = a.overallScore != null;
              const state = scored ? getScoreState(a.overallScore!) : null;
              const href =
                a.status === "COMPLETED" ? `/audit/${a.id}/report` : `/audit/${a.id}`;
              return (
                <Link
                  key={a.id}
                  href={href}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-secondary/40"
                >
                  {/* Score */}
                  <div className="flex w-12 shrink-0 flex-col items-center">
                    {scored ? (
                      <>
                        <span
                          className={`text-lg font-bold tabular-nums ${state!.color}`}
                        >
                          {a.overallScore}
                        </span>
                        <span className="text-[10px] text-muted-foreground">/ 100</span>
                      </>
                    ) : (
                      <span className="text-lg font-bold text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Host + url */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.host}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {a.url}
                    </p>
                  </div>

                  {/* Meta */}
                  <div className="hidden items-center gap-6 sm:flex">
                    {a.status === "COMPLETED" && (
                      <span className="text-xs text-muted-foreground">
                        {a.issueCount} issue{a.issueCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {a.status === "RUNNING" && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {a.progress}%
                      </span>
                    )}
                    <span className="w-16 text-right text-xs text-muted-foreground">
                      {timeAgo(a.createdAt)}
                    </span>
                  </div>

                  <Badge variant={STATUS_VARIANT[a.status] ?? "secondary"}>
                    {state && a.status === "COMPLETED" ? (
                      <>
                        <Icon name={state.icon} className="size-3" />
                        {state.label}
                      </>
                    ) : (
                      a.status
                    )}
                  </Badge>
                </Link>
              );
            })}
          </Card>
        )}
      </main>
    </div>
  );
}
