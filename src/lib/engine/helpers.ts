// Shared helpers for analyzers. Keeps scoring deductions consistent and
// issue construction terse. All findings here are MEASURED (not AI).

import type { MeasuredIssue, CrawledPage } from "@/lib/engine/types";
import type { ScoreCategory, Severity, Impact, Effort } from "@prisma/client";

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

interface IssueInput {
  category: ScoreCategory;
  severity: Severity;
  title: string;
  problem: string;
  whyItMatters: string;
  recommendation: string;
  evidence?: Record<string, unknown>;
  impact?: Impact;
  effort?: Effort;
}

export function issue(input: IssueInput): MeasuredIssue {
  return {
    category: input.category,
    severity: input.severity,
    title: input.title,
    problem: input.problem,
    whyItMatters: input.whyItMatters,
    recommendation: input.recommendation,
    evidence: input.evidence,
    impact: input.impact ?? defaultImpact(input.severity),
    effort: input.effort ?? "MEDIUM",
  };
}

function defaultImpact(sev: Severity): Impact {
  if (sev === "CRITICAL" || sev === "HIGH") return "HIGH";
  if (sev === "MEDIUM") return "MEDIUM";
  return "LOW";
}

/**
 * Turns a list of weighted deductions into a 0–100 score starting from 100.
 * Each deduction is { points, when }. Only applied when `when` is true.
 */
export function scoreFromDeductions(
  deductions: { points: number; when: boolean }[],
): number {
  const total = deductions.reduce((acc, d) => acc + (d.when ? d.points : 0), 0);
  return clampScore(100 - total);
}

export function rootPage(pages: CrawledPage[]): CrawledPage {
  return pages[0];
}
