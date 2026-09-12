// Shared analysis helpers.
//
// Runs the registered analyzers over a measured AnalysisContext and returns the
// category results. Reused by both the full audit pipeline (which persists) and
// competitor scoring (which does not persist a full audit). Keeping this in one
// place means competitor scores use the exact same measured logic as the audit.

import type { AnalysisContext, CategoryResult } from "@/lib/engine/types";
import { ANALYZERS } from "@/lib/engine/registry";

/**
 * Runs every registered analyzer over the context. Skips categories whose
 * measurement tooling was unavailable (available === false) so we never emit a
 * fabricated 0. A single analyzer throwing never aborts the others.
 */
export async function runAnalyzers(
  ctx: AnalysisContext,
  onCategory?: (category: string) => void | Promise<void>,
): Promise<CategoryResult[]> {
  const results: CategoryResult[] = [];
  for (const analyzer of ANALYZERS) {
    await onCategory?.(analyzer.category);
    try {
      const result = await analyzer.analyze(ctx);
      const available = (result.details as { available?: boolean })?.available;
      if (available === false) continue;
      results.push(result);
    } catch (err) {
      console.error(`[analyze] analyzer ${analyzer.category} failed`, err);
    }
  }
  return results;
}

/**
 * Enriches a context with Lighthouse + axe measurements (both non-fatal).
 * Dynamically imported so the heavy dependency trees stay out of route bundles.
 */
export async function enrichContext(ctx: AnalysisContext): Promise<AnalysisContext> {
  ctx.lighthouse = await import("@/lib/crawler/lighthouse")
    .then((m) => m.runLighthouse(ctx.rootUrl))
    .catch(() => undefined);
  ctx.axe = await import("@/lib/crawler/axe")
    .then((m) => m.runAxe(ctx.rootUrl))
    .catch(() => undefined);
  return ctx;
}
