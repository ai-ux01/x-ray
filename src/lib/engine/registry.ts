// Analyzer registry.
//
// Analyzers are registered here and run by the pipeline. Each phase adds more
// entries; the pipeline and persistence code never change. Every analyzer
// produces MEASURED results only.

import type { Analyzer } from "@/lib/engine/types";
import { seoAnalyzer } from "@/lib/engine/analyzers/seo";
import { technicalAnalyzer } from "@/lib/engine/analyzers/technical";
import { performanceAnalyzer } from "@/lib/engine/analyzers/performance";
import { accessibilityAnalyzer } from "@/lib/engine/analyzers/accessibility";
import { mobileAnalyzer } from "@/lib/engine/analyzers/mobile";

// Registered in pipeline execution order. AI interpretation runs separately.
export const ANALYZERS: Analyzer[] = [
  // Phase 3
  seoAnalyzer,
  technicalAnalyzer,
  // Phase 4
  performanceAnalyzer,
  accessibilityAnalyzer,
  // Phase 5: mobile
  mobileAnalyzer,
  // Later: ux, content, conversion, security, ai_readiness
];

// Maps an analyzer category to the pipeline stage used for progress reporting.
export const CATEGORY_STAGE: Record<string, string> = {
  PERFORMANCE: "PERFORMANCE",
  SEO: "SEO",
  ACCESSIBILITY: "ACCESSIBILITY",
  UX: "UX",
  MOBILE: "MOBILE",
  CONTENT: "CONTENT",
  CONVERSION: "CONVERSION",
  TECHNICAL: "SEO", // technical runs alongside SEO stage
  SECURITY: "SEO",
  AI_READINESS: "CONTENT",
};
