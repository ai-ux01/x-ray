import { describe, it, expect } from "vitest";
import { computeScoringSummary } from "./scoring-engine";
import { CATEGORY_WEIGHTS } from "@/lib/scoring";
import type { CategoryResult, MeasuredIssue } from "@/lib/engine/types";
import type { ScoreCategory, Severity } from "@prisma/client";

function result(
  category: ScoreCategory,
  score: number,
  issues: Partial<MeasuredIssue>[] = [],
): CategoryResult {
  return {
    category,
    score,
    summary: `${category} ${score}`,
    issues: issues.map((i) => ({
      category,
      severity: (i.severity ?? "MEDIUM") as Severity,
      title: i.title ?? "x",
      problem: "p",
      whyItMatters: "w",
      recommendation: "r",
      impact: "MEDIUM",
      effort: "MEDIUM",
      ...i,
    })) as MeasuredIssue[],
  };
}

describe("bounds — overall is an integer in [0,100]", () => {
  const cases: CategoryResult[][] = [
    [result("SEO", 100), result("PERFORMANCE", 100)],
    [result("SEO", 0), result("PERFORMANCE", 0)],
    [result("SEO", 50), result("PERFORMANCE", 73), result("MOBILE", 88)],
    [result("SEO", 150), result("PERFORMANCE", -20)], // out-of-range inputs
  ];
  it.each(cases)("returns a bounded integer", (...rs) => {
    const { overall } = computeScoringSummary(rs as CategoryResult[]);
    expect(Number.isInteger(overall)).toBe(true);
    expect(overall).toBeGreaterThanOrEqual(0);
    expect(overall).toBeLessThanOrEqual(100);
  });
});

describe("all-100 yields 100; all-0 yields 0", () => {
  it("all perfect scores => 100", () => {
    const { overall } = computeScoringSummary([
      result("SEO", 100),
      result("PERFORMANCE", 100),
      result("MOBILE", 100),
    ]);
    expect(overall).toBe(100);
  });

  it("all zero scores => 0", () => {
    const { overall } = computeScoringSummary([
      result("SEO", 0),
      result("PERFORMANCE", 0),
    ]);
    expect(overall).toBe(0);
  });
});

describe("weight shares sum to 1 and match the weighting model", () => {
  it("normalizes weights over measured categories only", () => {
    const summary = computeScoringSummary([
      result("SEO", 80),
      result("PERFORMANCE", 60),
    ]);
    const shareSum = summary.categories.reduce((a, c) => a + c.weightShare, 0);
    expect(shareSum).toBeCloseTo(1, 6);

    const totalWeight = CATEGORY_WEIGHTS.SEO + CATEGORY_WEIGHTS.PERFORMANCE;
    const seo = summary.categories.find((c) => c.category === "SEO")!;
    expect(seo.weightShare).toBeCloseTo(CATEGORY_WEIGHTS.SEO / totalWeight, 6);
  });

  it("overall equals the rounded sum of contributions", () => {
    const summary = computeScoringSummary([
      result("SEO", 80),
      result("PERFORMANCE", 60),
      result("MOBILE", 90),
    ]);
    const contribSum = summary.categories.reduce((a, c) => a + c.contribution, 0);
    expect(summary.overall).toBe(Math.round(contribSum));
  });
});

describe("monotonicity — raising a category never lowers the overall", () => {
  it("increasing one category's score does not decrease overall", () => {
    const base = computeScoringSummary([
      result("SEO", 50),
      result("PERFORMANCE", 50),
    ]).overall;
    const raised = computeScoringSummary([
      result("SEO", 90),
      result("PERFORMANCE", 50),
    ]).overall;
    expect(raised).toBeGreaterThanOrEqual(base);
  });
});

describe("partial pipelines — only measured categories count", () => {
  it("reports skipped categories and excludes them from the average", () => {
    const summary = computeScoringSummary([result("SEO", 80)]);
    expect(summary.overall).toBe(80); // single measured category
    expect(summary.categories).toHaveLength(1);
    expect(summary.skipped).toContain("PERFORMANCE");
    expect(summary.skipped).toContain("MOBILE");
    expect(summary.skipped).not.toContain("SEO");
  });

  it("empty results yield overall 0 with an honest explanation", () => {
    const summary = computeScoringSummary([]);
    expect(summary.overall).toBe(0);
    expect(summary.categories).toHaveLength(0);
    expect(summary.explanation).toMatch(/no categories/i);
  });
});

describe("issue rollup by severity", () => {
  it("counts issues across measured categories", () => {
    const summary = computeScoringSummary([
      result("SEO", 70, [{ severity: "CRITICAL" }, { severity: "LOW" }]),
      result("PERFORMANCE", 60, [{ severity: "HIGH" }, { severity: "HIGH" }]),
    ]);
    expect(summary.issueCounts.CRITICAL).toBe(1);
    expect(summary.issueCounts.HIGH).toBe(2);
    expect(summary.issueCounts.LOW).toBe(1);
    expect(summary.issueCounts.total).toBe(4);
  });
});

describe("explanation is traceable", () => {
  it("names each measured category and its score", () => {
    const summary = computeScoringSummary([
      result("SEO", 80),
      result("PERFORMANCE", 60),
    ]);
    expect(summary.explanation).toContain("SEO 80/100");
    expect(summary.explanation).toContain("PERFORMANCE 60/100");
  });
});
