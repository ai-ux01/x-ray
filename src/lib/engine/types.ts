// Analysis engine contracts.
//
// The engine is a pipeline of analyzers. Each analyzer receives a shared,
// growing `AnalysisContext` (measured facts) and contributes measured
// findings + a category score. The AI layer runs last and only INTERPRETS
// the measured findings — it never invents metrics.

import type { ScoreCategory, Severity, Impact, Effort } from "@prisma/client";

export interface CrawledPage {
  url: string;
  path: string;
  httpStatus: number;
  html: string;
  title?: string;
  metaDescription?: string;
  headings: { level: number; text: string }[];
  links: { href: string; text: string; internal: boolean }[];
  images: { src: string; alt: string | null }[];
  forms: { hasLabels: boolean; inputCount: number }[];
  structuredData: unknown[];
  desktopScreenshot?: string;
  mobileScreenshot?: string;
  /**
   * Forward-looking per-viewport screenshot storage keys
   * (viewportKey -> storage key). Backward-compatible: the legacy
   * desktopScreenshot/mobileScreenshot fields remain populated.
   */
  screenshots?: Partial<Record<string, string>>;
}

/**
 * Serializable metrics measured in-page (via page.evaluate) at a single
 * viewport. Pure DOM reads — no network.
 */
export interface ViewportMetrics {
  key: string;
  /** Layout viewport width (document.documentElement.clientWidth). */
  width: number;
  /** document.documentElement.scrollWidth. */
  scrollWidth: number;
  /** max(0, scrollWidth - width). */
  overflowPx: number;
  hasHorizontalScroll: boolean;
  /** Computed font-size on <body> in px. */
  baseFontPx: number;
  /** Count of visible text elements rendered below the legibility threshold. */
  smallTextNodes: number;
  tapTargets: {
    total: number;
    /** Interactive, visible elements smaller than the recommended minimum. */
    tooSmall: number;
    examples: { tag: string; text: string; w: number; h: number }[];
  };
  /** Best-guess primary CTA label (most confident on desktop). */
  primaryCtaText?: string;
  /** Whether a CTA is within [0, viewportHeight). */
  ctaVisibleAboveFold: boolean;
  /** Marker candidates with relative (0..1) coordinates; capped. */
  markerCandidates: MarkerCandidate[];
}

export interface MarkerCandidate {
  relX: number;
  relY: number;
  relW?: number;
  relH?: number;
  label: string;
  kind: "overflow" | "small-text" | "tap-target" | "cta";
}

/**
 * A flattened, analyzer-facing measurement for a single viewport of the root
 * page. Mirrors {@link ViewportMetrics} but with tap-target totals hoisted for
 * ergonomic access in the Mobile analyzer.
 */
export interface ViewportMeasurement {
  key: string;
  label: string;
  width: number;
  scrollWidth: number;
  overflowPx: number;
  hasHorizontalScroll: boolean;
  baseFontPx: number;
  smallTextNodes: number;
  tapTargetsTotal: number;
  tapTargetsTooSmall: number;
  tapTargetExamples: { tag: string; text: string; w: number; h: number }[];
  primaryCtaText?: string;
  ctaVisibleAboveFold: boolean;
  markerCandidates: MarkerCandidate[];
}

/**
 * A persisted visual marker positioned by relative coordinates on a
 * screenshot. Travels on CategoryResult.details.markers and is written to the
 * AuditVisualMarker table.
 */
export interface VisualMarker {
  viewport: string;
  relX: number;
  relY: number;
  relW?: number;
  relH?: number;
  /** 1-based display number, unique within its viewport. */
  index: number;
  label: string;
  category: ScoreCategory;
  severity: Severity;
  source: "MEASURED";
}

export interface RobotsInfo {
  present: boolean;
  allowsCrawling: boolean;
  sitemaps: string[];
  raw?: string;
}

export interface SitemapInfo {
  present: boolean;
  urlCount: number;
  urls: string[];
}

export interface SecurityHeaders {
  https: boolean;
  hsts: boolean;
  csp: boolean;
  xFrameOptions: boolean;
  referrerPolicy: boolean;
  permissionsPolicy: boolean;
  mixedContent: boolean;
  exposedServerInfo?: string | null;
}

export interface AnalysisContext {
  auditId: string;
  rootUrl: string;
  host: string;
  robots: RobotsInfo;
  sitemap: SitemapInfo;
  pages: CrawledPage[];
  securityHeaders: SecurityHeaders;
  /** Raw Lighthouse metrics for the root page (null when unavailable). */
  lighthouse?: import("@/lib/crawler/lighthouse").LighthouseMetrics;
  /** Raw axe-core accessibility results (null when unavailable). */
  axe?: import("@/lib/crawler/axe").AxeResult;
  /** Per-viewport measurements for the root page (Phase 5). */
  viewports?: ViewportMeasurement[];
  // Populated by analyzers as the pipeline runs.
  measured: Record<string, unknown>;
}

export interface MeasuredIssue {
  category: ScoreCategory;
  severity: Severity;
  title: string;
  problem: string;
  whyItMatters: string;
  recommendation: string;
  evidence?: Record<string, unknown>;
  impact: Impact;
  effort: Effort;
}

export interface CategoryResult {
  category: ScoreCategory;
  score: number; // 0..100
  summary: string; // every score has an explanation
  details?: Record<string, unknown>;
  issues: MeasuredIssue[];
}

export interface Analyzer {
  category: ScoreCategory;
  /** Pure, measured analysis. No AI, no fabricated data. */
  analyze(ctx: AnalysisContext): Promise<CategoryResult> | CategoryResult;
}
