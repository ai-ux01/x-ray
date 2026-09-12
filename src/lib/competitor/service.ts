// Competitor analysis (Phase 10).
//
// Runs the SAME measured pipeline against a competitor URL and stores its
// category scores for side-by-side comparison with an audit. We do not create a
// full Audit for the competitor — only the measured category scores are needed
// for the comparison, kept as JSON on CompetitorComparison. All findings remain
// measured; no fabricated data.

import { prisma } from "@/lib/prisma";
import { crawlSite, CrawlBlockedError, CrawlUnreachableError } from "@/lib/crawler";
import { closeBrowser } from "@/lib/crawler/renderer";
import { runAnalyzers, enrichContext } from "@/lib/engine/analyze";
import { computeScoringSummary } from "@/lib/engine/scoring-engine";
import { validateUrlSyntax } from "@/lib/security/url-guard";

export interface CompetitorScores {
  overall: number;
  categories: Record<string, number>;
}

export interface AddCompetitorResult {
  ok: boolean;
  comparisonId?: string;
  error?: string;
}

/**
 * Analyzes a competitor URL and persists the comparison against `auditId`.
 * Reuses the crawler + analyzers + scoring engine so the numbers are directly
 * comparable to the audit's own scores.
 */
export async function addCompetitor(
  auditId: string,
  rawUrl: string,
): Promise<AddCompetitorResult> {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    select: { id: true, status: true, url: true },
  });
  if (!audit) return { ok: false, error: "Audit not found." };
  if (audit.status !== "COMPLETED") {
    return { ok: false, error: "Finish the main audit before adding competitors." };
  }

  const validation = validateUrlSyntax(rawUrl);
  if (!validation.ok || !validation.url || !validation.normalized) {
    return { ok: false, error: validation.error ?? "Invalid competitor URL." };
  }
  const url = validation.normalized;
  const host = validation.url.hostname.toLowerCase();

  // Don't let a competitor be the same host as the audited site.
  try {
    if (new URL(audit.url).hostname.toLowerCase() === host) {
      return { ok: false, error: "The competitor must be a different website." };
    }
  } catch {
    // ignore — audit.url is validated at creation
  }

  try {
    // Crawl + measure using the same engine (no Audit row created).
    const ctx = await crawlSite({ auditId: `cmp-${auditId}`, rootUrl: url });
    await enrichContext(ctx);
    const results = await runAnalyzers(ctx);
    const summary = computeScoringSummary(results);

    const scores: CompetitorScores = {
      overall: summary.overall,
      categories: Object.fromEntries(
        summary.categories.map((c) => [c.category, c.score]),
      ),
    };

    const competitor = await prisma.competitor.create({
      data: { url, host },
    });

    const comparison = await prisma.competitorComparison.upsert({
      where: {
        auditId_competitorId: { auditId, competitorId: competitor.id },
      },
      create: {
        auditId,
        competitorId: competitor.id,
        scores: scores as object,
      },
      update: { scores: scores as object },
    });

    return { ok: true, comparisonId: comparison.id };
  } catch (err) {
    if (err instanceof CrawlBlockedError || err instanceof CrawlUnreachableError) {
      return { ok: false, error: err.message };
    }
    console.error("[competitor] analysis failed:", err);
    return {
      ok: false,
      error: "We couldn't analyze that competitor. It may be unreachable or blocking automated access.",
    };
  } finally {
    await closeBrowser().catch(() => {});
  }
}

export interface CompetitorComparisonView {
  id: string;
  host: string;
  url: string;
  scores: CompetitorScores;
}

/** Loads all competitor comparisons for an audit. */
export async function listComparisons(
  auditId: string,
): Promise<CompetitorComparisonView[]> {
  const rows = await prisma.competitorComparison.findMany({
    where: { auditId },
    include: { competitor: { select: { host: true, url: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    host: r.competitor.host,
    url: r.competitor.url,
    scores: (r.scores ?? { overall: 0, categories: {} }) as CompetitorScores,
  }));
}
