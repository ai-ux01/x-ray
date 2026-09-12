import { CATEGORY_META } from "@/lib/scoring";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";

export interface IssueView {
  id: string;
  category: string;
  severity: string;
  source: string;
  title: string;
  problem: string;
  whyItMatters: string;
  recommendation: string;
  impact: string;
  effort: string;
}

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const SEVERITY_VARIANT: Record<string, "critical" | "poor" | "warning" | "good"> = {
  CRITICAL: "critical",
  HIGH: "poor",
  MEDIUM: "warning",
  LOW: "good",
};

export function PriorityIssues({ issues, limit = 5 }: { issues: IssueView[]; limit?: number }) {
  const sorted = [...issues].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  );
  const top = sorted.slice(0, limit);

  if (top.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No priority issues detected in the measured checks. Nice work.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {top.map((it, idx) => {
        const meta = CATEGORY_META[it.category];
        return (
          <Card key={it.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <Badge variant={SEVERITY_VARIANT[it.severity] ?? "warning"}>
                {it.severity}
              </Badge>
              {meta && (
                <Badge variant="secondary">
                  <Icon name={meta.icon} className="size-3" />
                  {meta.label}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {it.source === "MEASURED" ? "Measured" : "AI"}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                Impact {it.impact} · Effort {it.effort}
              </span>
            </div>

            <h3 className="mt-3 font-semibold">{it.title}</h3>

            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Problem</dt>
                <dd className="mt-0.5">{it.problem}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Why it matters</dt>
                <dd className="mt-0.5">{it.whyItMatters}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Recommendation</dt>
                <dd className="mt-0.5">{it.recommendation}</dd>
              </div>
            </dl>
          </Card>
        );
      })}
    </div>
  );
}
