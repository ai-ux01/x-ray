// Semantic scoring system shared by the engine and the UI.
// Product principle: never rely on color alone — every state has an
// icon, a numeric score, and a text status.

export type ScoreState = "excellent" | "good" | "warning" | "poor" | "critical";

export interface ScoreStateInfo {
  state: ScoreState;
  label: string;
  /** Tailwind text color token */
  color: string;
  /** lucide-react icon name, resolved in the UI layer */
  icon: string;
  min: number;
  max: number;
}

export const SCORE_STATES: ScoreStateInfo[] = [
  { state: "excellent", label: "Excellent", color: "text-excellent", icon: "CheckCircle2", min: 90, max: 100 },
  { state: "good", label: "Good", color: "text-good", icon: "ThumbsUp", min: 75, max: 89 },
  { state: "warning", label: "Needs Improvement", color: "text-warning", icon: "AlertTriangle", min: 60, max: 74 },
  { state: "poor", label: "Poor", color: "text-poor", icon: "AlertOctagon", min: 40, max: 59 },
  { state: "critical", label: "Critical", color: "text-critical", icon: "XCircle", min: 0, max: 39 },
];

export function getScoreState(score: number): ScoreStateInfo {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return (
    SCORE_STATES.find((s) => clamped >= s.min && clamped <= s.max) ??
    SCORE_STATES[SCORE_STATES.length - 1]
  );
}

export const CATEGORY_META: Record<
  string,
  { key: string; label: string; description: string; icon: string }
> = {
  PERFORMANCE: { key: "PERFORMANCE", label: "Performance", description: "Loading speed, Core Web Vitals, resource weight.", icon: "Gauge" },
  SEO: { key: "SEO", label: "SEO", description: "Discoverability, metadata, structure, indexability.", icon: "Search" },
  ACCESSIBILITY: { key: "ACCESSIBILITY", label: "Accessibility", description: "Usable by everyone, including assistive tech.", icon: "Accessibility" },
  UX: { key: "UX", label: "UX / UI", description: "Visual hierarchy, navigation, clarity, trust.", icon: "LayoutDashboard" },
  MOBILE: { key: "MOBILE", label: "Mobile", description: "Responsive layout and touch experience.", icon: "Smartphone" },
  CONTENT: { key: "CONTENT", label: "Content", description: "Clarity, value proposition, readability.", icon: "FileText" },
  CONVERSION: { key: "CONVERSION", label: "Conversion", description: "CTAs, trust signals, friction, social proof.", icon: "TrendingUp" },
  TECHNICAL: { key: "TECHNICAL", label: "Technical", description: "HTML health, status codes, errors, DOM size.", icon: "Code2" },
  SECURITY: { key: "SECURITY", label: "Security", description: "Passive configuration review — not a pen test.", icon: "ShieldCheck" },
  AI_READINESS: { key: "AI_READINESS", label: "AI Readiness", description: "Structured, machine-readable, entity-rich content.", icon: "Sparkles" },
};

export const CATEGORY_ORDER = [
  "PERFORMANCE",
  "SEO",
  "ACCESSIBILITY",
  "UX",
  "MOBILE",
  "CONTENT",
  "CONVERSION",
  "TECHNICAL",
  "SECURITY",
  "AI_READINESS",
] as const;

// Weights used by the executive (overall) score engine. Sum need not be 1;
// the engine normalizes. Kept here so weighting is transparent and tunable.
export const CATEGORY_WEIGHTS: Record<string, number> = {
  PERFORMANCE: 1.2,
  SEO: 1.2,
  ACCESSIBILITY: 1.0,
  UX: 1.0,
  MOBILE: 1.0,
  CONTENT: 0.9,
  CONVERSION: 1.0,
  TECHNICAL: 1.1,
  SECURITY: 0.8,
  AI_READINESS: 0.6,
};

export function computeOverall(scores: Record<string, number>): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const [cat, value] of Object.entries(scores)) {
    const w = CATEGORY_WEIGHTS[cat] ?? 1;
    weighted += value * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  return Math.round(weighted / totalWeight);
}
