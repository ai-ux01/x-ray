// Mobile Experience analyzer (Phase 5) — measured only.
//
// Reads per-viewport measurements captured by the renderer and produces a
// MOBILE category score with evidence-backed issues plus visual markers. When
// no viewport measurements are available it returns `available: false` so the
// pipeline skips it rather than persisting a fabricated 0 (Req 2.8).

import * as cheerio from "cheerio";
import type {
  Analyzer,
  AnalysisContext,
  CategoryResult,
  MeasuredIssue,
  ViewportMeasurement,
  VisualMarker,
  MarkerCandidate,
} from "@/lib/engine/types";
import type { Severity } from "@prisma/client";
import { issue, rootPage } from "@/lib/engine/helpers";
import {
  computeMobileScore,
  normalizeMarkers,
  MIN_TAP_TARGET_PX,
  SMALL_TEXT_PX,
  TAP_TARGET_TOLERANCE,
} from "@/lib/engine/analyzers/mobile-scoring";
import { MOBILE_VIEWPORT_KEYS } from "@/lib/crawler/viewports";

function severityForKind(kind: MarkerCandidate["kind"]): Severity {
  switch (kind) {
    case "overflow":
      return "HIGH";
    case "tap-target":
      return "MEDIUM";
    case "small-text":
      return "MEDIUM";
    case "cta":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

/** Picks the primary mobile viewport (prefer 390px, else 375px, else first). */
function pickMobileViewport(
  viewports: ViewportMeasurement[],
): ViewportMeasurement | undefined {
  return (
    viewports.find((v) => v.key === "mobile") ??
    viewports.find((v) => v.key === "mobile-sm") ??
    viewports.find((v) => MOBILE_VIEWPORT_KEYS.includes(v.key as never))
  );
}

export const mobileAnalyzer: Analyzer = {
  category: "MOBILE",
  analyze(ctx: AnalysisContext): CategoryResult {
    const viewports = ctx.viewports ?? [];
    const mobile = pickMobileViewport(viewports);

    // Skip path (Req 2.8 / Property 8): no measurement → not persisted.
    if (!mobile) {
      return {
        category: "MOBILE",
        score: 0,
        summary:
          "Mobile experience could not be measured (no viewport measurements were captured). No score is shown to avoid fabricating data.",
        details: { available: false },
        issues: [],
      };
    }

    const issues: MeasuredIssue[] = [];

    // Viewport meta is detected from the root HTML; the Technical analyzer owns
    // the primary penalty, so Mobile only applies a small deduction (Req 2.5).
    const page = rootPage(ctx.pages);
    const $ = cheerio.load(page.html);
    const missingViewportMeta = $('meta[name="viewport"]').length === 0;

    // --- Overflow / horizontal scroll (Req 2.2) -----------------------------
    if (mobile.overflowPx > 0) {
      issues.push(
        issue({
          category: "MOBILE",
          severity: mobile.overflowPx >= 50 ? "HIGH" : "MEDIUM",
          title: "Content overflows on mobile",
          problem: `At ${mobile.label}, page content is ${mobile.overflowPx}px wider than the screen (scroll width ${mobile.scrollWidth}px vs viewport ${mobile.width}px), forcing horizontal scrolling.`,
          whyItMatters:
            "Horizontal scrolling on mobile is disorienting and often hides content and controls off-screen.",
          recommendation:
            "Use responsive units, avoid fixed widths wider than the viewport, and set max-width: 100% on media and containers.",
          evidence: {
            viewport: mobile.width,
            scrollWidth: mobile.scrollWidth,
            overflowPx: mobile.overflowPx,
          },
          impact: "HIGH",
          effort: "MEDIUM",
        }),
      );
    }

    // --- Text too small (Req 2.3) -------------------------------------------
    if (mobile.baseFontPx < SMALL_TEXT_PX || mobile.smallTextNodes > 0) {
      issues.push(
        issue({
          category: "MOBILE",
          severity: mobile.baseFontPx < SMALL_TEXT_PX ? "HIGH" : "MEDIUM",
          title: "Text is too small to read on mobile",
          problem:
            mobile.baseFontPx < SMALL_TEXT_PX
              ? `Base font size is ${mobile.baseFontPx.toFixed(0)}px (below the ${SMALL_TEXT_PX}px legibility threshold).`
              : `${mobile.smallTextNodes} text element(s) render below ${SMALL_TEXT_PX}px on mobile.`,
          whyItMatters:
            "Tiny text forces users to pinch-zoom and hurts readability and accessibility.",
          recommendation:
            "Use a base font size of at least 16px and avoid setting text below 12px on mobile.",
          evidence: {
            baseFontPx: mobile.baseFontPx,
            smallTextNodes: mobile.smallTextNodes,
          },
          impact: "MEDIUM",
          effort: "LOW",
        }),
      );
    }

    // --- Tap targets too small (Req 2.4) ------------------------------------
    if (mobile.tapTargetsTooSmall > TAP_TARGET_TOLERANCE) {
      issues.push(
        issue({
          category: "MOBILE",
          severity: mobile.tapTargetsTooSmall > 8 ? "HIGH" : "MEDIUM",
          title: "Touch targets are too small",
          problem: `${mobile.tapTargetsTooSmall} interactive element(s) are smaller than ${MIN_TAP_TARGET_PX}×${MIN_TAP_TARGET_PX}px on mobile.`,
          whyItMatters:
            "Small tap targets are hard to hit accurately, causing mis-taps and frustration.",
          recommendation: `Ensure buttons and links are at least ${MIN_TAP_TARGET_PX}×${MIN_TAP_TARGET_PX}px with adequate spacing.`,
          evidence: {
            tooSmall: mobile.tapTargetsTooSmall,
            total: mobile.tapTargetsTotal,
            examples: mobile.tapTargetExamples,
          },
          impact: "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    // --- Missing viewport meta (Req 2.5, small deduction) -------------------
    if (missingViewportMeta) {
      issues.push(
        issue({
          category: "MOBILE",
          severity: "MEDIUM",
          title: "No responsive viewport meta tag",
          problem:
            "The page has no <meta name=\"viewport\"> tag, so mobile browsers render it at desktop width.",
          whyItMatters:
            "Without a viewport meta tag, the site is not truly responsive on phones.",
          recommendation:
            'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>.',
          impact: "HIGH",
          effort: "LOW",
        }),
      );
    }

    // --- Mobile CTA not visible (Req 2.6, no false positives) ---------------
    // Only raise when a CTA was confidently found (has text) AND it is not
    // above the mobile fold. If detection is inconclusive, raise nothing.
    const ctaConfident = Boolean(mobile.primaryCtaText);
    const ctaNotVisible = ctaConfident && !mobile.ctaVisibleAboveFold;
    if (ctaNotVisible) {
      issues.push(
        issue({
          category: "MOBILE",
          severity: "MEDIUM",
          title: "Primary call-to-action is not visible on mobile",
          problem: `The primary CTA ("${mobile.primaryCtaText}") is not within the mobile above-the-fold area.`,
          whyItMatters:
            "If the main action is below the fold on mobile, conversions drop.",
          recommendation:
            "Move or duplicate the primary CTA into the mobile above-the-fold region.",
          evidence: { primaryCtaText: mobile.primaryCtaText },
          impact: "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    // --- Score (traceable) ---------------------------------------------------
    const { score, deductions } = computeMobileScore({
      overflowPx: mobile.overflowPx,
      baseFontPx: mobile.baseFontPx,
      smallTextNodes: mobile.smallTextNodes,
      tapTargetsTooSmall: mobile.tapTargetsTooSmall,
      missingViewportMeta,
      ctaNotVisible,
    });

    // --- Visual markers for the mobile viewport -----------------------------
    const markers: VisualMarker[] = normalizeMarkers(
      mobile.key,
      mobile.markerCandidates,
      "MOBILE",
      severityForKind,
    );

    return {
      category: "MOBILE",
      score,
      summary: `Mobile experience ${score}/100 at ${mobile.label}. ${
        issues.length
      } issue(s) found${
        mobile.overflowPx > 0 ? `, ${mobile.overflowPx}px overflow` : ""
      }.`,
      details: {
        available: true,
        viewport: mobile.key,
        overflowPx: mobile.overflowPx,
        baseFontPx: mobile.baseFontPx,
        smallTextNodes: mobile.smallTextNodes,
        tapTargetsTotal: mobile.tapTargetsTotal,
        tapTargetsTooSmall: mobile.tapTargetsTooSmall,
        missingViewportMeta,
        ctaNotVisible,
        deductions,
        markers,
      },
      issues,
    };
  },
};
