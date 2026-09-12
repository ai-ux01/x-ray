"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trophy } from "lucide-react";
import { CATEGORY_META, CATEGORY_ORDER, getScoreState } from "@/lib/scoring";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Competitor {
  id: string;
  host: string;
  url: string;
  scores: { overall: number; categories: Record<string, number> };
}

interface Props {
  auditId: string;
  auditHost: string;
  auditScores: { overall: number; categories: Record<string, number> };
  initialCompetitors: Competitor[];
}

function ScoreCell({ value }: { value: number | undefined }) {
  if (value == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const state = getScoreState(value);
  return <span className={`font-semibold tabular-nums ${state.color}`}>{value}</span>;
}

export function CompetitorComparison({
  auditId,
  auditHost,
  auditScores,
  initialCompetitors,
}: Props) {
  const router = useRouter();
  const [competitors, setCompetitors] = React.useState(initialCompetitors);
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Only show categories that the main audit measured.
  const categories = CATEGORY_ORDER.filter(
    (c) => auditScores.categories[c] != null,
  );

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audits/${auditId}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "We couldn't analyze that competitor.");
        return;
      }
      // Reload the persisted comparisons.
      const listRes = await fetch(`/api/audits/${auditId}/competitors`, {
        cache: "no-store",
      });
      const listData = (await listRes.json()) as { comparisons: Competitor[] };
      setCompetitors(listData.comparisons);
      setUrl("");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-1 flex items-center gap-2">
        <Trophy className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Competitor comparison</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Measured scores side by side. Each competitor is analyzed with the same
        engine, so the numbers are directly comparable.
      </p>

      <form onSubmit={onAdd} className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          type="text"
          inputMode="url"
          placeholder="competitor.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          aria-label="Competitor URL"
        />
        <Button type="submit" disabled={loading || !url.trim()}>
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Analyzing…
            </>
          ) : (
            <>
              <Plus className="size-4" /> Add competitor
            </>
          )}
        </Button>
      </form>
      {error && <p className="mb-4 text-sm text-poor">{error}</p>}
      {loading && (
        <p className="mb-4 text-xs text-muted-foreground">
          Running a full measured crawl of the competitor — this can take up to a
          minute.
        </p>
      )}

      {competitors.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Add a competitor URL above to see how this site stacks up.
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="p-3 font-medium">Category</th>
                <th className="p-3 text-center font-medium">
                  {auditHost}
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    this site
                  </span>
                </th>
                {competitors.map((c) => (
                  <th key={c.id} className="p-3 text-center font-medium">
                    {c.host}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-secondary/30">
                <td className="p-3 font-semibold">Overall</td>
                <td className="p-3 text-center">
                  <ScoreCell value={auditScores.overall} />
                </td>
                {competitors.map((c) => (
                  <td key={c.id} className="p-3 text-center">
                    <ScoreCell value={c.scores.overall} />
                  </td>
                ))}
              </tr>
              {categories.map((cat) => {
                const meta = CATEGORY_META[cat];
                return (
                  <tr key={cat} className="border-b border-border last:border-0">
                    <td className="p-3 text-muted-foreground">
                      {meta?.label ?? cat}
                    </td>
                    <td className="p-3 text-center">
                      <ScoreCell value={auditScores.categories[cat]} />
                    </td>
                    {competitors.map((c) => (
                      <td key={c.id} className="p-3 text-center">
                        <ScoreCell value={c.scores.categories[cat]} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
