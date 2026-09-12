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
 * Runs a promise with a hard timeout. If it doesn't settle in time, resolves to
 * `fallback` so a hung external tool (e.g. Lighthouse spawning Chrome in a
 * container) can never stall the whole pipeline.
 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * Enriches a context with Lighthouse + axe measurements (both non-fatal and
 * bounded by a hard timeout). Dynamically imported so the heavy dependency
 * trees stay out of route bundles.
 */
export async function enrichContext(ctx: AnalysisContext): Promise<AnalysisContext> {
  // Generous ceilings: these tools drive a headless browser. If they hang
  // (e.g. no system Chrome in a container), we degrade to "unavailable" rather
  // than stalling the audit forever.
  const LIGHTHOUSE_TIMEOUT_MS = 90_000;
  const AXE_TIMEOUT_MS = 60_000;

  ctx.lighthouse = await withTimeout(
    import("@/lib/crawler/lighthouse")
      .then((m) => m.runLighthouse(ctx.rootUrl))
      .catch(() => undefined),
    LIGHTHOUSE_TIMEOUT_MS,
    undefined,
  );
  ctx.axe = await withTimeout(
    import("@/lib/crawler/axe")
      .then((m) => m.runAxe(ctx.rootUrl))
      .catch(() => undefined),
    AXE_TIMEOUT_MS,
    undefined,
  );
  return ctx;
}
