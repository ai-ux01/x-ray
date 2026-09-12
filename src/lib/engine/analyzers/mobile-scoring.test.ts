import { describe, it, expect } from "vitest";
import {
  overflowDeduction,
  fontDeduction,
  tapTargetDeduction,
  computeMobileScore,
  normalizeMarkers,
  TAP_TARGET_TOLERANCE,
  MIN_TAP_TARGET_PX,
  SMALL_TEXT_PX,
  type MobileScoreInputs,
} from "./mobile-scoring";
import type { MarkerCandidate } from "@/lib/engine/types";

const clean: MobileScoreInputs = {
  overflowPx: 0,
  baseFontPx: 16,
  smallTextNodes: 0,
  tapTargetsTooSmall: 0,
  missingViewportMeta: false,
  ctaNotVisible: false,
};

describe("Property 1 — score is bounded [0,100]", () => {
  const cases: MobileScoreInputs[] = [
    clean,
    { ...clean, overflowPx: 9999, baseFontPx: 4, smallTextNodes: 500, tapTargetsTooSmall: 500, missingViewportMeta: true, ctaNotVisible: true },
    { ...clean, overflowPx: 40, smallTextNodes: 5 },
  ];
  it.each(cases)("returns an integer within [0,100]", (input) => {
    const { score } = computeMobileScore(input);
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("Property 2 — monotonic in defects; clean = 100", () => {
  it("clean inputs yield 100", () => {
    expect(computeMobileScore(clean).score).toBe(100);
  });

  it("adding overflow never increases the score", () => {
    const base = computeMobileScore(clean).score;
    const worse = computeMobileScore({ ...clean, overflowPx: 60 }).score;
    expect(worse).toBeLessThanOrEqual(base);
  });

  it("more small-text nodes never increases the score", () => {
    const few = computeMobileScore({ ...clean, smallTextNodes: 2 }).score;
    const many = computeMobileScore({ ...clean, smallTextNodes: 20 }).score;
    expect(many).toBeLessThanOrEqual(few);
  });

  it("more too-small tap targets never increases the score", () => {
    const few = computeMobileScore({ ...clean, tapTargetsTooSmall: 5 }).score;
    const many = computeMobileScore({ ...clean, tapTargetsTooSmall: 50 }).score;
    expect(many).toBeLessThanOrEqual(few);
  });
});

describe("Property 3 — deductions are traceable", () => {
  it("score equals 100 - sum(applied deductions), clamped", () => {
    const input: MobileScoreInputs = {
      ...clean,
      overflowPx: 60,
      smallTextNodes: 5,
      tapTargetsTooSmall: 6,
      missingViewportMeta: true,
      ctaNotVisible: true,
    };
    const { score, deductions } = computeMobileScore(input);
    const total = deductions.reduce((a, d) => a + d.points, 0);
    expect(score).toBe(Math.max(0, Math.min(100, 100 - total)));
  });

  it("every deduction has a positive point value and a reason", () => {
    const { deductions } = computeMobileScore({ ...clean, overflowPx: 60 });
    for (const d of deductions) {
      expect(d.points).toBeGreaterThan(0);
      expect(d.reason).toBeTruthy();
    }
  });
});

describe("Property 4 — no overflow implies no overflow deduction", () => {
  it("overflowPx <= 0 yields zero deduction and no overflow reason", () => {
    expect(overflowDeduction(0)).toBe(0);
    expect(overflowDeduction(-5)).toBe(0);
    const { deductions } = computeMobileScore(clean);
    expect(deductions.some((d) => d.reason === "overflow")).toBe(false);
  });
});

describe("Property 5 — threshold correctness (12px, 40px inclusive)", () => {
  it("font size exactly at the threshold does not deduct", () => {
    expect(fontDeduction(SMALL_TEXT_PX, 0)).toBe(0);
    expect(fontDeduction(SMALL_TEXT_PX + 4, 0)).toBe(0);
  });

  it("font size just below the threshold deducts", () => {
    expect(fontDeduction(SMALL_TEXT_PX - 1, 0)).toBeGreaterThan(0);
  });

  it("tap targets within tolerance never deduct (boundary inclusive)", () => {
    expect(tapTargetDeduction(0)).toBe(0);
    expect(tapTargetDeduction(TAP_TARGET_TOLERANCE)).toBe(0);
    expect(tapTargetDeduction(TAP_TARGET_TOLERANCE + 1)).toBeGreaterThan(0);
  });

  it("MIN_TAP_TARGET_PX boundary is 40", () => {
    expect(MIN_TAP_TARGET_PX).toBe(40);
  });
});

describe("Property 7 — markers are normalized, capped, 1-based", () => {
  const raw: MarkerCandidate[] = Array.from({ length: 12 }, (_, i) => ({
    relX: i % 2 === 0 ? 1.5 : -0.3, // out of range on purpose
    relY: 0.5,
    relW: 2,
    relH: -1,
    label: `m${i}`,
    kind: "tap-target" as const,
  }));

  const markers = normalizeMarkers(
    "mobile",
    raw,
    "MOBILE",
    () => "MEDIUM",
    8,
  );

  it("caps the number of markers", () => {
    expect(markers.length).toBe(8);
  });

  it("clamps all relative coordinates to [0,1]", () => {
    for (const m of markers) {
      expect(m.relX).toBeGreaterThanOrEqual(0);
      expect(m.relX).toBeLessThanOrEqual(1);
      expect(m.relY).toBeGreaterThanOrEqual(0);
      expect(m.relY).toBeLessThanOrEqual(1);
      expect(m.relW).toBeGreaterThanOrEqual(0);
      expect(m.relW).toBeLessThanOrEqual(1);
      expect(m.relH).toBeGreaterThanOrEqual(0);
      expect(m.relH).toBeLessThanOrEqual(1);
    }
  });

  it("assigns unique 1-based indexes", () => {
    const indexes = markers.map((m) => m.index);
    expect(indexes).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it("marks every marker as MEASURED", () => {
    expect(markers.every((m) => m.source === "MEASURED")).toBe(true);
  });
});
