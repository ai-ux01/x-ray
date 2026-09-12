import { describe, it, expect } from "vitest";
import { generateRecommendations } from "./recommendations";
import { AIUnavailableError } from "@/lib/ai";
import { computeScoringSummary } from "@/lib/engine/scoring-engine";
import type { CategoryResult } from "@/lib/engine/types";

// The default test env has AI_PROVIDER unset/"disabled", so the provider is
// not configured. Generation must fail safely rather than fabricating output.
describe("generateRecommendations — AI optional", () => {
  const results: CategoryResult[] = [
    { category: "SEO", score: 70, summary: "SEO 70", issues: [] },
  ];
  const summary = computeScoringSummary(results);

  it("throws AIUnavailableError when no provider is configured", async () => {
    await expect(generateRecommendations(results, summary)).rejects.toBeInstanceOf(
      AIUnavailableError,
    );
  });
});
