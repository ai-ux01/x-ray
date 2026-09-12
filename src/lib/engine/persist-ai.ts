// Persists AI-generated recommendations (Phase 7).
//
// Recommendations are stored with source = AI so the report can clearly
// distinguish AI interpretation from MEASURED data. Internal prompts are NEVER
// persisted — only the parsed output and token usage.

import { prisma } from "@/lib/prisma";
import type { RecommendationResult } from "@/lib/ai/recommendations";

export async function persistRecommendations(
  auditId: string,
  result: RecommendationResult,
): Promise<number> {
  // Idempotent per audit: clear prior AI rows so re-runs don't duplicate.
  await prisma.recommendation.deleteMany({ where: { auditId, source: "AI" } });

  if (result.recommendations.length) {
    await prisma.recommendation.createMany({
      data: result.recommendations.map((r) => ({
        auditId,
        category: r.category,
        source: "AI" as const,
        title: r.title,
        problem: r.problem,
        evidence: r.evidence,
        recommendation: r.recommendation,
        impact: r.impact,
        effort: r.effort,
        priority: r.priority,
        roadmap: r.roadmap,
        beforeText: r.beforeText ?? null,
        afterText: r.afterText ?? null,
        rationale: r.rationale ?? null,
      })),
    });
  }

  // Store the analysis record (output only — never the prompt).
  await prisma.aIAnalysis.create({
    data: {
      auditId,
      provider: result.provider,
      model: result.model,
      kind: "consultant",
      output: { recommendations: result.recommendations } as object,
      promptTokens: result.promptTokens ?? null,
      completionTokens: result.completionTokens ?? null,
    },
  });

  return result.recommendations.length;
}
