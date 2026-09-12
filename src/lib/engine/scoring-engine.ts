// Scoring engine (Phase 6).
//
// Consolidates per-category analyzer results into a transparent, explainable
// executive score. Pure and side-effect free so it can be unit-tested and
// reused by both persistence and the report UI.
//
// Product principles honored here:
//  - Never fabricate: only categories that were actually measured contribute
//    to the overall score. Skipped categories are reported, not zeroed.
//  - Every score has an explanation: the summary lists the weighted
//    contribution of each category so the overall number is fully traceable.

import { CATEGORY_WEIGHTS, getScoreState, type ScoreStateInfo } from "@/lib/scoring";
import { clampScore } from "@/lib/engine/helpers";
import type { CategoryResult } from "@/lib/engine/types";
import type { ScoreCategory, Severity } from "@prisma/client";

export interface CategoryScore {
  category: ScoreCategory;
  score: number;
  state: ScoreStateInfo;
  weight: number;
  /** Normalized share of the overall score this category contributed (0..1). */
  weightShare: number;
  /** score × weightShare — the points this category added to the overall. */
  contribution: number;
  summary: string;
}

export interface SeverityCounts {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  total: number;
}

export interface ScoringSummary {
  overall: number;
  overallState: ScoreStateInfo;
  /** Per-category breakdown for the categories that were measured. */
  categories: CategoryScore[];
  /** Categories present in the weighting model but not measured this run. */
  skipped: ScoreCategory[];
  issueCounts: SeverityCounts;
  /** Human-readable explanation of how the overall was derived. */
  explanation: string;
}

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function emptyCounts(): SeverityCounts {
  return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, total: 0 };
}

/**
 * Computes the executive scoring summary from measured category results.
 *
 * Weighting is transparent: each category's contribution is its score times
 * its normalized weight share (weight / Σweights over measured categories).
 * The overall is the rounded sum of contributions, always in [0, 100].
 */
export function computeScoringSummary(
  results: CategoryResult[],
): ScoringSummary {
  // Only "OVERALL" is excluded here; analyzers never emit it.
  const measured = results.filter((r) => r.category !== "OVERALL");

  const totalWeight = measured.reduce(
    (acc, r) => acc + (CATEGORY_WEIGHTS[r.category] ?? 1),
    0,
  );

  const categories: CategoryScore[] = measured.map((r) => {
    const weight = CATEGORY_WEIGHTS[r.category] ?? 1;
    const weightShare = totalWeight > 0 ? weight / totalWeight : 0;
    const score = clampScore(r.score);
    return {
      category: r.category,
      score,
      state: getScoreState(score),
      weight,
      weightShare,
      contribution: score * weightShare,
      summary: r.summary,
    };
  });

  const overall = clampScore(
    categories.reduce((acc, c) => acc + c.contribution, 0),
  );

  // Categories in the weighting model that were not measured this run.
  const measuredSet = new Set(measured.map((r) => r.category));
  const skipped = (Object.keys(CATEGORY_WEIGHTS) as ScoreCategory[]).filter(
    (cat) => !measuredSet.has(cat),
  );

  // Roll up issue counts by severity across all measured categories.
  const issueCounts = emptyCounts();
  for (const r of measured) {
    for (const issue of r.issues) {
      if (SEVERITIES.includes(issue.severity)) {
        issueCounts[issue.severity] += 1;
        issueCounts.total += 1;
      }
    }
  }

  return {
    overall,
    overallState: getScoreState(overall),
    categories,
    skipped,
    issueCounts,
    explanation: buildExplanation(overall, categories, skipped, issueCounts),
  };
}

function buildExplanation(
  overall: number,
  categories: CategoryScore[],
  skipped: ScoreCategory[],
  counts: SeverityCounts,
): string {
  if (categories.length === 0) {
    return "No categories could be measured for this site, so no overall score is available.";
  }
  const parts = categories
    .slice()
    .sort((a, b) => b.contribution - a.contribution)
    .map(
      (c) =>
        `${c.category} ${c.score}/100 (weight ${(c.weightShare * 100).toFixed(0)}%)`,
    );
  const skippedNote =
    skipped.length > 0
      ? ` Not measured this run: ${skipped.join(", ")}.`
      : "";
  const issueNote =
    counts.total > 0
      ? ` ${counts.total} measured issue(s): ${counts.CRITICAL} critical, ${counts.HIGH} high, ${counts.MEDIUM} medium, ${counts.LOW} low.`
      : " No measured issues.";
  return `Overall ${overall}/100, a weighted average of ${categories.length} measured categories — ${parts.join("; ")}.${skippedNote}${issueNote}`;
}

/** Severity rank used for ordering priority issues (lower = more urgent). */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};
