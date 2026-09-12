import { RotateCw, Info } from "lucide-react";
import { getScoreState, CATEGORY_META, CATEGORY_ORDER } from "@/lib/scoring";
import { SiteHeader } from "@/components/site-header";
import { ScoreRing } from "@/components/score-ring";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";

// NOTE: This page uses clearly-labelled SAMPLE data for demonstration only.
// It is never presented as a real audit of a real site.
const SAMPLE_SCORES: Record<string, number> = {
  PERFORMANCE: 91,
  SEO: 84,
  ACCESSIBILITY: 92,
  UX: 78,
  MOBILE: 89,
  CONTENT: 81,
  CONVERSION: 74,
  TECHNICAL: 95,
  SECURITY: 88,
  AI_READINESS: 72,
};

const SAMPLE_OVERALL = 82;

export default function SampleReportPage() {
  const overallState = getScoreState(SAMPLE_OVERALL);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container flex-1 py-10">
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
          <Info className="size-4" />
          Sample report with demonstration data. This is not a real audit.
        </div>

        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="font-mono text-sm text-muted-foreground">https://example.com</p>
            <p className="text-xs text-muted-foreground">Sample analysis</p>
          </div>
          <Button variant="outline" size="sm" disabled>
            <RotateCw className="size-4" /> Re-analyze
          </Button>
        </div>

        <Card className="mb-8 flex flex-col items-center gap-6 p-8 sm:flex-row">
          <ScoreRing score={SAMPLE_OVERALL} size={168} />
          <div className="flex-1 text-center sm:text-left">
            <Badge variant={overallState.state} className="mb-2">
              <Icon name={overallState.icon} className="size-3.5" />
              {overallState.label}
            </Badge>
            <h1 className="text-2xl font-bold">Website Health Score</h1>
            <p className="mt-1 text-muted-foreground">
              Good — but there are several high-impact opportunities.
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORY_ORDER.map((cat) => {
            const value = SAMPLE_SCORES[cat];
            const state = getScoreState(value);
            const meta = CATEGORY_META[cat];
            return (
              <Card key={cat} className="p-4">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name={meta.icon} className="size-4" />
                  {meta.label}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums">{value}</span>
                  <Badge variant={state.state} className="text-[10px]">
                    {state.label}
                  </Badge>
                </div>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
