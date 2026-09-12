// Audit pipeline orchestrator.
//
// Phase 2 wires the real crawler (Playwright + Cheerio) into the CRAWLING and
// BROWSER_ANALYSIS stages and persists AuditPage records. Analyzers for the
// remaining stages are registered in later phases. The pipeline updates
// stage/progress so the live UI reflects real work, handles all crawler error
// modes gracefully, and NEVER writes fabricated scores.

import { prisma } from "@/lib/prisma";
import type { AuditStage } from "@prisma/client";
import {
  crawlSite,
  CrawlBlockedError,
  CrawlUnreachableError,
} from "@/lib/crawler";
import { closeBrowser } from "@/lib/crawler/renderer";
import type { AnalysisContext, CategoryResult } from "@/lib/engine/types";
import { persistResults } from "@/lib/engine/persist";
import { computeScoringSummary } from "@/lib/engine/scoring-engine";
import { runAnalyzers, enrichContext } from "@/lib/engine/analyze";
import { isAIEnabled } from "@/lib/ai";

async function setStage(auditId: string, stage: AuditStage, progress: number) {
  await prisma.audit.update({
    where: { id: auditId },
    data: { stage, progress, status: "RUNNING" },
  });
}

export async function runAuditPipeline(auditId: string): Promise<void> {
  const audit = await prisma.audit.findUnique({ where: { id: auditId } });
  if (!audit) return;

  await prisma.audit.update({
    where: { id: auditId },
    data: { status: "RUNNING", startedAt: new Date(), stage: "CRAWLING", progress: 5 },
  });

  try {
    // --- Stage: CRAWLING + BROWSER_ANALYSIS -------------------------------
    const ctx = await runCrawl(auditId, audit.url);

    // Persist pages (measured data only).
    await persistPages(auditId, ctx);

    await setStage(auditId, "BROWSER_ANALYSIS", 25);

    // --- Lighthouse (performance) + axe-core (accessibility) --------------
    // Both are non-fatal: on failure the corresponding analyzer is skipped
    // rather than fabricating data. They run against the root URL.
    // Dynamically imported so the heavy Lighthouse dependency tree is loaded
    // only inside the Node runtime at execution time — it is never traced into
    // the API route bundle (which breaks under Turbopack).
    await setStage(auditId, "PERFORMANCE", 32);
    await enrichContext(ctx);
    await setStage(auditId, "ACCESSIBILITY", 40);

    // --- Run registered analyzers (measured) ------------------------------
    // Each analyzer maps to a progress checkpoint. The shared runAnalyzers
    // helper (also used for competitor scoring) keeps the measured logic in one
    // place; the onCategory callback drives the live-progress stage updates.
    const stageForCategory: Record<string, { stage: AuditStage; progress: number }> = {
      SEO: { stage: "SEO", progress: 45 },
      TECHNICAL: { stage: "SEO", progress: 50 },
      PERFORMANCE: { stage: "PERFORMANCE", progress: 35 },
      ACCESSIBILITY: { stage: "ACCESSIBILITY", progress: 55 },
      UX: { stage: "UX", progress: 65 },
      MOBILE: { stage: "UX", progress: 68 },
      CONTENT: { stage: "CONTENT", progress: 72 },
      CONVERSION: { stage: "CONVERSION", progress: 80 },
      SECURITY: { stage: "SEO", progress: 52 },
      AI_READINESS: { stage: "CONTENT", progress: 74 },
    };

    const results: CategoryResult[] = await runAnalyzers(ctx, async (category) => {
      const checkpoint = stageForCategory[category];
      if (checkpoint) await setStage(auditId, checkpoint.stage, checkpoint.progress);
    });

    // --- Scoring + report -------------------------------------------------
    await setStage(auditId, "SCORING", 90);
    const overall = await persistResults(auditId, results);

    // --- AI interpretation (optional) -------------------------------------
    // AI only INTERPRETS the measured findings. It is entirely optional: when
    // no provider is configured or the call fails, the audit still completes
    // with the measured report intact (product principle: works without AI).
    if (isAIEnabled() && results.length > 0) {
      await setStage(auditId, "AI_ANALYSIS", 94);
      try {
        const summary = computeScoringSummary(results);
        const [{ generateRecommendations }, { persistRecommendations }] =
          await Promise.all([
            import("@/lib/ai/recommendations"),
            import("@/lib/engine/persist-ai"),
          ]);
        const recs = await generateRecommendations(results, summary);
        await persistRecommendations(auditId, recs);
      } catch (err) {
        // AI is optional — never fail the audit because AI was unavailable.
        console.warn("[pipeline] AI recommendations skipped:", err);
      }
    }

    await setStage(auditId, "REPORT", 98);

    await prisma.audit.update({
      where: { id: auditId },
      data: {
        stage: "DONE",
        progress: 100,
        status: "COMPLETED",
        overallScore: overall,
        completedAt: new Date(),
        meta: {
          pageCount: ctx.pages.length,
          robots: ctx.robots.present,
          sitemap: ctx.sitemap.present,
          sitemapUrls: ctx.sitemap.urlCount,
          categoriesAnalyzed: results.length,
        },
      },
    });
  } catch (err) {
    await failAudit(auditId, err);
  } finally {
    // Free the shared browser between audits in single-run contexts.
    await closeBrowser().catch(() => {});
  }
}

async function runCrawl(auditId: string, url: string): Promise<AnalysisContext> {
  return crawlSite({ auditId, rootUrl: url });
}

async function persistPages(auditId: string, ctx: AnalysisContext) {
  for (const page of ctx.pages) {
    await prisma.auditPage.create({
      data: {
        auditId,
        url: page.url,
        path: page.path,
        httpStatus: page.httpStatus,
        title: page.title ?? null,
        metaDesc: page.metaDescription ?? null,
        desktopShot: page.desktopScreenshot ?? null,
        mobileShot: page.mobileScreenshot ?? null,
        screenshots: page.screenshots ? (page.screenshots as object) : undefined,
        extracted: {
          headingCount: page.headings.length,
          headings: page.headings.slice(0, 40),
          linkCount: page.links.length,
          internalLinks: page.links.filter((l) => l.internal).length,
          imageCount: page.images.length,
          imagesMissingAlt: page.images.filter((i) => !i.alt).length,
          formCount: page.forms.length,
          structuredDataCount: page.structuredData.length,
        },
      },
    });
  }
}

async function failAudit(auditId: string, err: unknown) {
  let message =
    "We couldn't complete this analysis. The site may be unreachable or blocking automated access.";
  if (err instanceof CrawlBlockedError || err instanceof CrawlUnreachableError) {
    message = err.message;
  }
  console.error(`[pipeline] audit ${auditId} failed:`, err);
  await prisma.audit.update({
    where: { id: auditId },
    data: { status: "FAILED", errorMessage: message },
  });
}
