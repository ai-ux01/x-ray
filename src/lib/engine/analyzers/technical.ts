// Technical Health analyzer — measured checks only.
// Covers: HTTP status, viewport, charset, favicon, DOM size, JS/console
// errors, resource failures, canonicalization, doctype, and lang attribute.

import * as cheerio from "cheerio";
import type { Analyzer, AnalysisContext, CategoryResult, MeasuredIssue } from "@/lib/engine/types";
import { issue, scoreFromDeductions, rootPage } from "@/lib/engine/helpers";

interface CrawlMeta {
  consoleErrors?: string[];
  failedRequests?: { url: string; failure: string }[];
}

export const technicalAnalyzer: Analyzer = {
  category: "TECHNICAL",
  analyze(ctx: AnalysisContext): CategoryResult {
    const page = rootPage(ctx.pages);
    const issues: MeasuredIssue[] = [];
    const $ = cheerio.load(page.html);
    const meta = (ctx.measured ?? {}) as CrawlMeta;

    const consoleErrors = meta.consoleErrors ?? [];
    const failedRequests = meta.failedRequests ?? [];

    const hasViewport = $('meta[name="viewport"]').length > 0;
    const hasCharset =
      $("meta[charset]").length > 0 ||
      /charset/i.test($('meta[http-equiv="Content-Type"]').attr("content") ?? "");
    const hasFavicon = $('link[rel~="icon"]').length > 0;
    const hasDoctype = /^\s*<!doctype html>/i.test(page.html);
    const hasLang = !!$("html").attr("lang");
    const domNodes = $("*").length;
    const badStatus = page.httpStatus >= 400 || page.httpStatus === 0;

    if (badStatus) {
      issues.push(
        issue({
          category: "TECHNICAL",
          severity: "CRITICAL",
          title: "Homepage returned an error status",
          problem: `The homepage responded with HTTP ${page.httpStatus}.`,
          whyItMatters: "Error responses block users and prevent indexing.",
          recommendation: "Ensure the homepage returns a 200 status.",
          evidence: { status: page.httpStatus },
          impact: "HIGH",
          effort: "MEDIUM",
        }),
      );
    }

    if (!hasViewport) {
      issues.push(
        issue({
          category: "TECHNICAL",
          severity: "HIGH",
          title: "Missing viewport meta tag",
          problem: "No responsive viewport meta tag was found.",
          whyItMatters: "Without it, mobile browsers render the page at desktop width.",
          recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
          impact: "HIGH",
          effort: "LOW",
        }),
      );
    }

    if (!hasCharset) {
      issues.push(
        issue({
          category: "TECHNICAL",
          severity: "MEDIUM",
          title: "Missing character encoding declaration",
          problem: "No <meta charset> was found.",
          whyItMatters: "Missing charset can cause text-rendering issues across browsers.",
          recommendation: 'Add <meta charset="utf-8"> as the first element in <head>.',
          impact: "MEDIUM",
          effort: "LOW",
        }),
      );
    }

    if (!hasDoctype) {
      issues.push(
        issue({
          category: "TECHNICAL",
          severity: "LOW",
          title: "Missing or non-standard doctype",
          problem: "The document does not start with <!doctype html>.",
          whyItMatters: "A missing doctype can trigger browser quirks mode.",
          recommendation: "Add the HTML5 doctype at the top of the document.",
          impact: "LOW",
          effort: "LOW",
        }),
      );
    }

    if (!hasLang) {
      issues.push(
        issue({
          category: "TECHNICAL",
          severity: "LOW",
          title: "Missing lang attribute",
          problem: "The <html> element has no lang attribute.",
          whyItMatters: "Language declaration helps browsers, translation and assistive tech.",
          recommendation: 'Set <html lang="en"> (or your primary language).',
          impact: "LOW",
          effort: "LOW",
        }),
      );
    }

    if (!hasFavicon) {
      issues.push(
        issue({
          category: "TECHNICAL",
          severity: "LOW",
          title: "Missing favicon",
          problem: "No favicon link was found.",
          whyItMatters: "A favicon reinforces brand identity in tabs and bookmarks.",
          recommendation: "Add a favicon link in <head>.",
          impact: "LOW",
          effort: "LOW",
        }),
      );
    }

    if (domNodes > 1500) {
      issues.push(
        issue({
          category: "TECHNICAL",
          severity: domNodes > 3000 ? "MEDIUM" : "LOW",
          title: "Excessive DOM size",
          problem: `The page contains about ${domNodes} DOM nodes.`,
          whyItMatters: "Large DOM trees increase memory use and slow rendering, especially on mobile.",
          recommendation: "Simplify markup and lazy-render off-screen sections.",
          evidence: { domNodes },
          impact: "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    if (consoleErrors.length > 0) {
      issues.push(
        issue({
          category: "TECHNICAL",
          severity: consoleErrors.length > 5 ? "MEDIUM" : "LOW",
          title: "JavaScript console errors",
          problem: `${consoleErrors.length} console error(s) were logged while loading.`,
          whyItMatters: "Console errors often indicate broken functionality.",
          recommendation: "Investigate and resolve the logged errors.",
          evidence: { sample: consoleErrors.slice(0, 5) },
          impact: "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    if (failedRequests.length > 0) {
      issues.push(
        issue({
          category: "TECHNICAL",
          severity: failedRequests.length > 5 ? "MEDIUM" : "LOW",
          title: "Failed network requests",
          problem: `${failedRequests.length} resource request(s) failed to load.`,
          whyItMatters: "Failed resources can break layout, styling or functionality.",
          recommendation: "Fix or remove references to the failing resources.",
          evidence: { sample: failedRequests.slice(0, 5) },
          impact: "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    const score = scoreFromDeductions([
      { points: 40, when: badStatus },
      { points: 16, when: !hasViewport },
      { points: 8, when: !hasCharset },
      { points: 3, when: !hasDoctype },
      { points: 3, when: !hasLang },
      { points: 3, when: !hasFavicon },
      { points: 10, when: domNodes > 3000 },
      { points: 5, when: domNodes > 1500 && domNodes <= 3000 },
      { points: 10, when: consoleErrors.length > 5 },
      { points: 5, when: consoleErrors.length > 0 && consoleErrors.length <= 5 },
      { points: 10, when: failedRequests.length > 5 },
      { points: 5, when: failedRequests.length > 0 && failedRequests.length <= 5 },
    ]);

    return {
      category: "TECHNICAL",
      score,
      summary: `Technical health ${score}/100. HTTP ${page.httpStatus}, ${domNodes} DOM nodes, ${consoleErrors.length} console error(s), ${failedRequests.length} failed request(s).`,
      details: {
        httpStatus: page.httpStatus,
        hasViewport,
        hasCharset,
        hasDoctype,
        hasLang,
        hasFavicon,
        domNodes,
        consoleErrors: consoleErrors.length,
        failedRequests: failedRequests.length,
      },
      issues,
    };
  },
};
