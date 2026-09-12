// Human-friendly labels for the live-progress UI. Mirrors the AuditStage enum
// and the pipeline order described in the audit architecture.

export const STAGE_STEPS: { stage: string; label: string }[] = [
  { stage: "CRAWLING", label: "Website loaded" },
  { stage: "BROWSER_ANALYSIS", label: "Browser analysis" },
  { stage: "SEO", label: "SEO analyzed" },
  { stage: "PERFORMANCE", label: "Performance analyzed" },
  { stage: "ACCESSIBILITY", label: "Accessibility analyzed" },
  { stage: "UX", label: "UX reviewed" },
  { stage: "CONTENT", label: "Content analyzed" },
  { stage: "CONVERSION", label: "Conversion analyzed" },
  { stage: "AI_ANALYSIS", label: "AI analysis" },
  { stage: "REPORT", label: "Report generation" },
];

const ORDER = [
  "CREATED",
  "CRAWLING",
  "BROWSER_ANALYSIS",
  "PERFORMANCE",
  "SEO",
  "ACCESSIBILITY",
  "UX",
  "CONTENT",
  "CONVERSION",
  "SCORING",
  "AI_ANALYSIS",
  "REPORT",
  "DONE",
];

export function stageIndex(stage: string): number {
  const i = ORDER.indexOf(stage);
  return i === -1 ? 0 : i;
}

export type StepState = "done" | "active" | "pending";

export function stepState(
  stepStage: string,
  currentStage: string,
  status: string,
): StepState {
  if (status === "COMPLETED") return "done";
  const cur = stageIndex(currentStage);
  const step = stageIndex(stepStage);
  if (step < cur) return "done";
  if (step === cur) return "active";
  return "pending";
}
