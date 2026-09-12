// Pure mobile-scoring helpers (Phase 5).
//
// These functions are side-effect free and fully unit-tested. They convert
// measured viewport facts into traceable deductions and a bounded 0–100 score.
// The Mobile analyzer wires them into the pipeline; keeping the math here makes
// the correctness properties (bounds, monotonicity, thresholds) easy to prove.

import { clampScore } from "@/lib/engine/helpers";
import type { MarkerCandidate, VisualMarker } from "@/lib/engine/types";
import type { ScoreCategory, Severity } from "@prisma/client";
import { MIN_TAP_TARGET_PX, SMALL_TEXT_PX, MAX_MARKERS } from "@/lib/crawler/measure";

export { MIN_TAP_TARGET_PX, SMALL_TEXT_PX, MAX_MARKERS };

/** Small tolerance for tap targets: a couple of tiny controls are forgiven. */
export const TAP_TARGET_TOLERANCE = 2;

/**
 * Deduction for horizontal overflow. 0 when there is no overflow (Property 4);
 * scales with severity and caps so a single defect can't zero the whole score.
 */
export function overflowDeduction(overflowPx: number): number {
  if (overflowPx <= 0) return 0;
  if (overflowPx < 10) return 10; // minor, likely a stray element
  if (overflowPx < 50) return 20;
  return 30; // substantial horizontal scrolling
}

/**
 * Deduction for text below the legibility threshold. Font sizes >= threshold
 * never deduct (Property 5). Scales with how many small nodes exist.
 */
export function fontDeduction(
  baseFontPx: number,
  smallTextNodes: number,
): number {
  let d = 0;
  if (baseFontPx > 0 && baseFontPx < SMALL_TEXT_PX) d += 15;
  if (smallTextNodes > 0) {
    if (smallTextNodes <= 3) d += 5;
    else if (smallTextNodes <= 10) d += 10;
    else d += 15;
  }
  return Math.min(d, 25);
}

/**
 * Deduction for too-small tap targets, forgiving up to TAP_TARGET_TOLERANCE.
 * Targets >= MIN_TAP_TARGET_PX never count as too small (Property 5, enforced
 * upstream in the measurement).
 */
export function tapTargetDeduction(tooSmall: number): number {
  const over = tooSmall - TAP_TARGET_TOLERANCE;
  if (over <= 0) return 0;
  if (over <= 3) return 10;
  if (over <= 8) return 20;
  return 30;
}

export interface MobileScoreInputs {
  overflowPx: number;
  baseFontPx: number;
  smallTextNodes: number;
  tapTargetsTooSmall: number;
  /** Small deduction; the Technical analyzer owns the primary penalty. */
  missingViewportMeta: boolean;
  /** Only true when a desktop CTA was confidently found and is not above fold. */
  ctaNotVisible: boolean;
}

export interface MobileScoreResult {
  score: number;
  /** Traceable list of applied deductions (points + reason key). */
  deductions: { points: number; reason: string }[];
}

/** Small deduction for missing viewport meta (Technical owns the big penalty). */
export const VIEWPORT_META_DEDUCTION = 5;
export const CTA_DEDUCTION = 8;

/**
 * Computes a bounded, monotonic, traceable mobile score. The final score is
 * exactly `100 − Σ(applied deductions)` clamped to [0, 100] (Property 3).
 */
export function computeMobileScore(inputs: MobileScoreInputs): MobileScoreResult {
  const deductions: { points: number; reason: string }[] = [];

  const overflow = overflowDeduction(inputs.overflowPx);
  if (overflow > 0) deductions.push({ points: overflow, reason: "overflow" });

  const font = fontDeduction(inputs.baseFontPx, inputs.smallTextNodes);
  if (font > 0) deductions.push({ points: font, reason: "font" });

  const tap = tapTargetDeduction(inputs.tapTargetsTooSmall);
  if (tap > 0) deductions.push({ points: tap, reason: "tap-target" });

  if (inputs.missingViewportMeta) {
    deductions.push({ points: VIEWPORT_META_DEDUCTION, reason: "viewport-meta" });
  }
  if (inputs.ctaNotVisible) {
    deductions.push({ points: CTA_DEDUCTION, reason: "cta" });
  }

  const total = deductions.reduce((acc, d) => acc + d.points, 0);
  return { score: clampScore(100 - total), deductions };
}

/**
 * Normalizes raw marker candidates into persisted VisualMarkers: clamps coords
 * to [0,1], caps the total, and assigns a unique 1-based index per viewport
 * (Property 7).
 */
export function normalizeMarkers(
  viewport: string,
  candidates: MarkerCandidate[],
  category: ScoreCategory,
  severityForKind: (kind: MarkerCandidate["kind"]) => Severity,
  cap: number = MAX_MARKERS,
): VisualMarker[] {
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  return candidates.slice(0, cap).map((c, i) => {
    const marker: VisualMarker = {
      viewport,
      relX: clamp01(c.relX),
      relY: clamp01(c.relY),
      index: i + 1,
      label: c.label,
      category,
      severity: severityForKind(c.kind),
      source: "MEASURED",
    };
    if (c.relW != null) marker.relW = clamp01(c.relW);
    if (c.relH != null) marker.relH = clamp01(c.relH);
    return marker;
  });
}
