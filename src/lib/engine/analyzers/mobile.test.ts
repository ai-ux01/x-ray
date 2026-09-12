import { describe, it, expect } from "vitest";
import { mobileAnalyzer } from "./mobile";
import type { AnalysisContext, ViewportMeasurement, CrawledPage } from "@/lib/engine/types";

function makePage(html: string): CrawledPage {
  return {
    url: "https://example.com/",
    path: "/",
    httpStatus: 200,
    html,
    headings: [],
    links: [],
    images: [],
    forms: [],
    structuredData: [],
  };
}

function makeCtx(
  viewports: ViewportMeasurement[] | undefined,
  html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>',
): AnalysisContext {
  return {
    auditId: "a1",
    rootUrl: "https://example.com/",
    host: "example.com",
    robots: { present: true, allowsCrawling: true, sitemaps: [] },
    sitemap: { present: false, urlCount: 0, urls: [] },
    pages: [makePage(html)],
    securityHeaders: {
      https: true,
      hsts: false,
      csp: false,
      xFrameOptions: false,
      referrerPolicy: false,
      permissionsPolicy: false,
      mixedContent: false,
    },
    viewports,
    measured: {},
  };
}

const cleanMobile: ViewportMeasurement = {
  key: "mobile",
  label: "Mobile (390px)",
  width: 390,
  scrollWidth: 390,
  overflowPx: 0,
  hasHorizontalScroll: false,
  baseFontPx: 16,
  smallTextNodes: 0,
  tapTargetsTotal: 10,
  tapTargetsTooSmall: 0,
  tapTargetExamples: [],
  ctaVisibleAboveFold: true,
  markerCandidates: [],
};

describe("Property 8 — skip is honest", () => {
  it("returns available:false with no issues when viewports are missing", () => {
    const result = mobileAnalyzer.analyze(makeCtx(undefined)) as {
      details?: { available?: boolean };
      issues: unknown[];
      score: number;
    };
    expect(result.details?.available).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it("returns available:false when viewports is empty", () => {
    const result = mobileAnalyzer.analyze(makeCtx([])) as {
      details?: { available?: boolean };
    };
    expect(result.details?.available).toBe(false);
  });
});

describe("clean mobile page scores 100 with no markers", () => {
  it("produces a perfect score and available:true", () => {
    const result = mobileAnalyzer.analyze(makeCtx([cleanMobile])) as {
      score: number;
      details?: { available?: boolean; markers?: unknown[] };
      issues: unknown[];
    };
    expect(result.details?.available).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.details?.markers).toHaveLength(0);
  });
});

describe("Property 6 — CTA has no false positives", () => {
  it("does not raise a CTA issue when no CTA was confidently found", () => {
    const vp: ViewportMeasurement = {
      ...cleanMobile,
      primaryCtaText: undefined,
      ctaVisibleAboveFold: false, // inconclusive detection
    };
    const result = mobileAnalyzer.analyze(makeCtx([vp])) as {
      details?: { ctaNotVisible?: boolean };
      issues: { title: string }[];
    };
    expect(result.details?.ctaNotVisible).toBe(false);
    expect(result.issues.some((i) => /call-to-action/i.test(i.title))).toBe(false);
  });

  it("raises a CTA issue only when a CTA exists and is below the fold", () => {
    const vp: ViewportMeasurement = {
      ...cleanMobile,
      primaryCtaText: "Get Started",
      ctaVisibleAboveFold: false,
    };
    const result = mobileAnalyzer.analyze(makeCtx([vp])) as {
      details?: { ctaNotVisible?: boolean };
      issues: { title: string }[];
    };
    expect(result.details?.ctaNotVisible).toBe(true);
    expect(result.issues.some((i) => /call-to-action/i.test(i.title))).toBe(true);
  });

  it("does not raise a CTA issue when the CTA is above the fold", () => {
    const vp: ViewportMeasurement = {
      ...cleanMobile,
      primaryCtaText: "Get Started",
      ctaVisibleAboveFold: true,
    };
    const result = mobileAnalyzer.analyze(makeCtx([vp])) as {
      details?: { ctaNotVisible?: boolean };
    };
    expect(result.details?.ctaNotVisible).toBe(false);
  });
});

describe("measured issues + markers on a poor page", () => {
  it("raises overflow and tap-target issues and builds markers", () => {
    const vp: ViewportMeasurement = {
      ...cleanMobile,
      scrollWidth: 520,
      overflowPx: 130,
      hasHorizontalScroll: true,
      tapTargetsTooSmall: 6,
      tapTargetExamples: [{ tag: "a", text: "x", w: 20, h: 20 }],
      markerCandidates: [
        { relX: 0.9, relY: 0.1, label: "Content overflows", kind: "overflow" },
        { relX: 0.5, relY: 0.5, relW: 0.1, relH: 0.05, label: "Tap target too small", kind: "tap-target" },
      ],
    };
    const result = mobileAnalyzer.analyze(makeCtx([vp])) as {
      score: number;
      issues: { title: string }[];
      details?: { markers?: { index: number }[] };
    };
    expect(result.score).toBeLessThan(100);
    expect(result.issues.some((i) => /overflow/i.test(i.title))).toBe(true);
    expect(result.issues.some((i) => /touch targets/i.test(i.title))).toBe(true);
    expect(result.details?.markers).toHaveLength(2);
    expect(result.details?.markers?.[0].index).toBe(1);
  });

  it("raises a viewport-meta issue when the tag is missing", () => {
    const html = "<!doctype html><html><head></head><body></body></html>";
    const result = mobileAnalyzer.analyze(makeCtx([cleanMobile], html)) as {
      issues: { title: string }[];
      details?: { missingViewportMeta?: boolean };
    };
    expect(result.details?.missingViewportMeta).toBe(true);
    expect(result.issues.some((i) => /viewport meta/i.test(i.title))).toBe(true);
  });
});
