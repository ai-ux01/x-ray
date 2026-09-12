// Performance analyzer — measured via Lighthouse.
//
// When Lighthouse is unavailable, we degrade gracefully: the analyzer returns
// no result (skipped) rather than fabricating numbers. Core product principle:
// never invent metrics.

import type { Analyzer, AnalysisContext, CategoryResult, MeasuredIssue } from "@/lib/engine/types";
import { issue, clampScore } from "@/lib/engine/helpers";

// Thresholds based on Core Web Vitals "good" boundaries.
const LCP_GOOD = 2500;
const LCP_POOR = 4000;
const CLS_GOOD = 0.1;
const CLS_POOR = 0.25;
const FCP_GOOD = 1800;
const TTFB_GOOD = 800;

export const performanceAnalyzer: Analyzer = {
  category: "PERFORMANCE",
  analyze(ctx: AnalysisContext): CategoryResult | Promise<CategoryResult> {
    const lh = ctx.lighthouse;
    const issues: MeasuredIssue[] = [];

    if (!lh || !lh.available) {
      return {
        category: "PERFORMANCE",
        score: 0,
        summary:
          "Performance could not be measured for this site (Lighthouse was unavailable). No score is shown to avoid fabricating data.",
        details: { available: false, error: lh?.error },
        issues: [],
      };
    }

    const fmtMs = (ms: number | null) => (ms == null ? "n/a" : `${(ms / 1000).toFixed(1)}s`);

    // LCP
    if (lh.lcp != null && lh.lcp > LCP_GOOD) {
      issues.push(
        issue({
          category: "PERFORMANCE",
          severity: lh.lcp > LCP_POOR ? "HIGH" : "MEDIUM",
          title: "Largest Contentful Paint is slow",
          problem: `LCP is ${fmtMs(lh.lcp)} (good is under ${LCP_GOOD / 1000}s).`,
          whyItMatters: "LCP measures how quickly the main content becomes visible. Slow LCP frustrates users and hurts rankings.",
          recommendation: "Optimize the hero image, preload critical assets, and reduce server response time.",
          evidence: { lcpMs: lh.lcp },
          impact: lh.lcp > LCP_POOR ? "HIGH" : "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    // CLS
    if (lh.cls != null && lh.cls > CLS_GOOD) {
      issues.push(
        issue({
          category: "PERFORMANCE",
          severity: lh.cls > CLS_POOR ? "HIGH" : "MEDIUM",
          title: "Layout shifts during load",
          problem: `Cumulative Layout Shift is ${lh.cls} (good is under ${CLS_GOOD}).`,
          whyItMatters: "Unexpected layout shifts cause misclicks and a jarring experience.",
          recommendation: "Set explicit width/height on images and reserve space for dynamic content and ads.",
          evidence: { cls: lh.cls },
          impact: "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    // TBT (INP proxy in lab)
    if (lh.tbt != null && lh.tbt > 200) {
      issues.push(
        issue({
          category: "PERFORMANCE",
          severity: lh.tbt > 600 ? "HIGH" : "MEDIUM",
          title: "High main-thread blocking time",
          problem: `Total Blocking Time is ${lh.tbt}ms (a proxy for interaction responsiveness/INP).`,
          whyItMatters: "Long tasks block the main thread, making the page feel unresponsive to taps and clicks.",
          recommendation: "Split long JavaScript tasks, defer non-critical scripts, and reduce third-party code.",
          evidence: { tbtMs: lh.tbt },
          impact: "MEDIUM",
          effort: "HIGH",
        }),
      );
    }

    // TTFB
    if (lh.ttfb != null && lh.ttfb > TTFB_GOOD) {
      issues.push(
        issue({
          category: "PERFORMANCE",
          severity: "MEDIUM",
          title: "Slow server response time (TTFB)",
          problem: `Time to First Byte is ${lh.ttfb}ms (good is under ${TTFB_GOOD}ms).`,
          whyItMatters: "A slow server delays everything else on the page.",
          recommendation: "Use caching/CDN, optimize backend queries, and consider edge rendering.",
          evidence: { ttfbMs: lh.ttfb },
          impact: "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    // FCP
    if (lh.fcp != null && lh.fcp > FCP_GOOD) {
      issues.push(
        issue({
          category: "PERFORMANCE",
          severity: "LOW",
          title: "Slow First Contentful Paint",
          problem: `FCP is ${fmtMs(lh.fcp)} (good is under ${FCP_GOOD / 1000}s).`,
          whyItMatters: "FCP is the first sign to users that the page is loading.",
          recommendation: "Reduce render-blocking resources and inline critical CSS.",
          evidence: { fcpMs: lh.fcp },
          impact: "LOW",
          effort: "MEDIUM",
        }),
      );
    }

    // Render-blocking resources
    if (lh.renderBlocking) {
      issues.push(
        issue({
          category: "PERFORMANCE",
          severity: "MEDIUM",
          title: "Render-blocking resources",
          problem: "Scripts or stylesheets are blocking the first render.",
          whyItMatters: "Render-blocking resources delay when users see content.",
          recommendation: "Defer non-critical JS, use async, and inline critical CSS.",
          impact: "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    // Compression
    if (lh.usesTextCompression === false) {
      issues.push(
        issue({
          category: "PERFORMANCE",
          severity: "MEDIUM",
          title: "Text compression not enabled",
          problem: "Text resources are served without gzip/brotli compression.",
          whyItMatters: "Compression dramatically reduces transfer size of HTML, CSS and JS.",
          recommendation: "Enable brotli or gzip compression at your server or CDN.",
          impact: "MEDIUM",
          effort: "LOW",
        }),
      );
    }

    // Offscreen images / lazy loading
    if (lh.offscreenImages) {
      issues.push(
        issue({
          category: "PERFORMANCE",
          severity: "LOW",
          title: "Offscreen images not lazy-loaded",
          problem: "Images below the fold load eagerly.",
          whyItMatters: "Eagerly loading offscreen images wastes bandwidth and slows initial load.",
          recommendation: 'Add loading="lazy" to below-the-fold images.',
          impact: "LOW",
          effort: "LOW",
        }),
      );
    }

    // Large JS bundle
    if (lh.scriptBytes != null && lh.scriptBytes > 500 * 1024) {
      issues.push(
        issue({
          category: "PERFORMANCE",
          severity: lh.scriptBytes > 1024 * 1024 ? "HIGH" : "MEDIUM",
          title: "Large JavaScript payload",
          problem: `About ${(lh.scriptBytes / 1024).toFixed(0)} KB of JavaScript is transferred.`,
          whyItMatters: "Large JS bundles slow parsing and execution, especially on mobile.",
          recommendation: "Code-split, tree-shake, and remove unused dependencies.",
          evidence: { scriptBytes: lh.scriptBytes },
          impact: "MEDIUM",
          effort: "HIGH",
        }),
      );
    }

    // Score: prefer Lighthouse's own performance score (authoritative measured value).
    const score = clampScore(lh.performanceScore ?? 0);

    return {
      category: "PERFORMANCE",
      score,
      summary: `Performance score ${score}/100 (Lighthouse). LCP ${fmtMs(lh.lcp)}, CLS ${lh.cls ?? "n/a"}, TBT ${lh.tbt ?? "n/a"}ms, TTFB ${lh.ttfb ?? "n/a"}ms.`,
      details: {
        available: true,
        performanceScore: lh.performanceScore,
        lcp: lh.lcp,
        cls: lh.cls,
        fcp: lh.fcp,
        ttfb: lh.ttfb,
        tbt: lh.tbt,
        speedIndex: lh.speedIndex,
        scriptBytes: lh.scriptBytes,
        styleBytes: lh.styleBytes,
        imageBytes: lh.imageBytes,
        totalBytes: lh.totalBytes,
        thirdPartyCount: lh.thirdPartyCount,
      },
      issues,
    };
  },
};
