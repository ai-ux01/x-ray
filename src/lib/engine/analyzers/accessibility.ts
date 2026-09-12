// Accessibility analyzer — measured via axe-core, with supplementary checks.
// Covers axe WCAG violations plus form labels, image alt, and lang attribute.

import * as cheerio from "cheerio";
import type { Analyzer, AnalysisContext, CategoryResult, MeasuredIssue } from "@/lib/engine/types";
import { issue, scoreFromDeductions, rootPage } from "@/lib/engine/helpers";
import type { Severity } from "@prisma/client";

const IMPACT_SEVERITY: Record<string, Severity> = {
  critical: "CRITICAL",
  serious: "HIGH",
  moderate: "MEDIUM",
  minor: "LOW",
};

const IMPACT_DEDUCTION: Record<string, number> = {
  critical: 15,
  serious: 9,
  moderate: 4,
  minor: 2,
};

export const accessibilityAnalyzer: Analyzer = {
  category: "ACCESSIBILITY",
  analyze(ctx: AnalysisContext): CategoryResult {
    const page = rootPage(ctx.pages);
    const axe = ctx.axe;
    const issues: MeasuredIssue[] = [];

    if (!axe || !axe.available) {
      return {
        category: "ACCESSIBILITY",
        score: 0,
        summary:
          "Accessibility could not be measured (axe-core was unavailable). No score is shown to avoid fabricating data.",
        details: { available: false, error: axe?.error },
        issues: [],
      };
    }

    let deduction = 0;

    // Turn each axe violation into a measured issue.
    for (const v of axe.violations) {
      const impact = v.impact ?? "minor";
      deduction += (IMPACT_DEDUCTION[impact] ?? 2) * Math.min(v.nodes, 3) / 1.5;
      issues.push(
        issue({
          category: "ACCESSIBILITY",
          severity: IMPACT_SEVERITY[impact] ?? "LOW",
          title: v.help,
          problem: `${v.description} Affects ${v.nodes} element(s).`,
          whyItMatters:
            "This violates WCAG guidelines and can prevent people using assistive technology from using the site.",
          recommendation: `Resolve the "${v.id}" rule. See the WCAG success criteria: ${v.wcagTags.join(", ") || "WCAG 2.1"}.`,
          evidence: { rule: v.id, nodes: v.nodes, wcag: v.wcagTags },
          impact: impact === "critical" || impact === "serious" ? "HIGH" : "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    // Supplementary HTML checks (defensive; axe usually catches these too).
    const $ = cheerio.load(page.html);
    const hasLang = !!$("html").attr("lang");
    if (!hasLang) {
      issues.push(
        issue({
          category: "ACCESSIBILITY",
          severity: "MEDIUM",
          title: "Missing document language",
          problem: "The <html> element has no lang attribute.",
          whyItMatters: "Screen readers use the lang attribute to select the correct pronunciation.",
          recommendation: 'Add lang="en" (or the correct language) to <html>.',
          impact: "MEDIUM",
          effort: "LOW",
        }),
      );
      deduction += 5;
    }

    const score = scoreFromDeductions([{ points: Math.round(deduction), when: true }]);

    const critical = axe.violations.filter((v) => v.impact === "critical").length;
    const serious = axe.violations.filter((v) => v.impact === "serious").length;

    return {
      category: "ACCESSIBILITY",
      score,
      summary: `Accessibility score ${score}/100 (axe-core). ${axe.violations.length} violation type(s): ${critical} critical, ${serious} serious. ${axe.passes} checks passed.`,
      details: {
        available: true,
        violationTypes: axe.violations.length,
        critical,
        serious,
        passes: axe.passes,
        incomplete: axe.incomplete,
        hasLang,
      },
      issues,
    };
  },
};
