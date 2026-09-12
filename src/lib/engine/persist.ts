// Persists analyzer results to the database and computes the overall score.
// Overall score uses only the categories that actually ran (transparent
// weighting from src/lib/scoring.ts), so partial pipelines stay honest.

import { prisma } from "@/lib/prisma";
import { computeScoringSummary } from "@/lib/engine/scoring-engine";
import type { CategoryResult, VisualMarker } from "@/lib/engine/types";
import type { ScoreCategory } from "@prisma/client";

export async function persistResults(
  auditId: string,
  results: CategoryResult[],
): Promise<number> {
  // Persist category scores (upsert so re-runs are idempotent per category).
  for (const result of results) {
    await prisma.auditScore.upsert({
      where: { auditId_category: { auditId, category: result.category } },
      create: {
        auditId,
        category: result.category,
        score: result.score,
        summary: result.summary,
        details: (result.details ?? {}) as object,
      },
      update: {
        score: result.score,
        summary: result.summary,
        details: (result.details ?? {}) as object,
      },
    });

    // Persist visual markers carried on details (Phase 5).
    const markers = (result.details as { markers?: VisualMarker[] })?.markers;
    if (markers?.length) {
      await persistMarkers(auditId, markers);
    }

    // Persist measured issues for this category.
    if (result.issues.length) {
      await prisma.auditIssue.createMany({
        data: result.issues.map((i) => ({
          auditId,
          category: i.category,
          severity: i.severity,
          source: "MEASURED" as const,
          title: i.title,
          problem: i.problem,
          whyItMatters: i.whyItMatters,
          recommendation: i.recommendation,
          evidence: (i.evidence ?? {}) as object,
          impact: i.impact,
          effort: i.effort,
        })),
      });
    }
  }

  // Compute the executive summary from the categories that ran (transparent,
  // explainable weighting; skipped categories excluded — no fabricated zeros).
  const summary = computeScoringSummary(results);
  const overall = summary.overall;

  // Persist the full breakdown on the OVERALL score's details so the report
  // can render a traceable weighting explanation.
  const overallDetails = {
    explanation: summary.explanation,
    issueCounts: summary.issueCounts,
    skipped: summary.skipped,
    categories: summary.categories.map((c) => ({
      category: c.category,
      score: c.score,
      weight: c.weight,
      weightShare: c.weightShare,
      contribution: c.contribution,
    })),
  };

  await prisma.auditScore.upsert({
    where: { auditId_category: { auditId, category: "OVERALL" as ScoreCategory } },
    create: {
      auditId,
      category: "OVERALL",
      score: overall,
      summary: summary.explanation,
      details: overallDetails as object,
    },
    update: {
      score: overall,
      summary: summary.explanation,
      details: overallDetails as object,
    },
  });

  await prisma.audit.update({
    where: { id: auditId },
    data: { overallScore: overall },
  });

  return overall;
}

/**
 * Persists measured visual markers, linked to the audit's root page when
 * available. Markers already carry their viewport + relative coordinates and
 * a 1-based per-viewport index (Property 7). Idempotent per audit: existing
 * markers are cleared first so re-runs don't duplicate.
 */
async function persistMarkers(
  auditId: string,
  markers: VisualMarker[],
): Promise<void> {
  const rootPage = await prisma.auditPage.findFirst({
    where: { auditId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  await prisma.auditVisualMarker.deleteMany({ where: { auditId } });

  await prisma.auditVisualMarker.createMany({
    data: markers.map((m) => ({
      auditId,
      pageId: rootPage?.id ?? null,
      viewport: m.viewport,
      index: m.index,
      relX: m.relX,
      relY: m.relY,
      relW: m.relW ?? null,
      relH: m.relH ?? null,
      label: m.label,
      category: m.category,
      severity: m.severity,
      source: "MEASURED" as const,
    })),
  });
}
