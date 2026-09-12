// SEO analyzer — measured checks only.
// Covers: title, meta description, canonical, H1/heading hierarchy, sitemap,
// robots.txt, internal links, image alt text, Open Graph, Twitter cards,
// schema.org / structured data, indexability, HTTPS, and URL structure.

import * as cheerio from "cheerio";
import type { Analyzer, AnalysisContext, CategoryResult, MeasuredIssue } from "@/lib/engine/types";
import { issue, scoreFromDeductions, rootPage } from "@/lib/engine/helpers";

export const seoAnalyzer: Analyzer = {
  category: "SEO",
  analyze(ctx: AnalysisContext): CategoryResult {
    const page = rootPage(ctx.pages);
    const issues: MeasuredIssue[] = [];
    const $ = cheerio.load(page.html);

    const title = page.title?.trim() ?? "";
    const metaDesc = page.metaDescription?.trim() ?? "";
    const canonical = $('link[rel="canonical"]').attr("href")?.trim() ?? "";
    const robotsMeta = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
    const h1s = page.headings.filter((h) => h.level === 1);
    const imagesMissingAlt = page.images.filter((i) => i.alt === null || i.alt.trim() === "");

    const hasOg = /property=["']og:/i.test(page.html);
    const hasTwitter = /name=["']twitter:/i.test(page.html);
    const hasStructuredData = page.structuredData.length > 0;
    const noindex = robotsMeta.includes("noindex");

    // --- Title -------------------------------------------------------------
    if (!title) {
      issues.push(
        issue({
          category: "SEO",
          severity: "CRITICAL",
          title: "Missing page title",
          problem: "The homepage has no <title> element.",
          whyItMatters:
            "The title is the single most important on-page SEO signal and the clickable headline in search results.",
          recommendation: "Add a concise, descriptive <title> (50–60 characters) with your primary keyword and brand.",
          impact: "HIGH",
          effort: "LOW",
        }),
      );
    } else if (title.length < 15 || title.length > 65) {
      issues.push(
        issue({
          category: "SEO",
          severity: "MEDIUM",
          title: "Title length is not optimal",
          problem: `The title is ${title.length} characters.`,
          whyItMatters: "Titles that are too short lack context; too long and search engines truncate them.",
          recommendation: "Aim for roughly 50–60 characters.",
          evidence: { title, length: title.length },
          impact: "MEDIUM",
          effort: "LOW",
        }),
      );
    }

    // --- Meta description --------------------------------------------------
    if (!metaDesc) {
      issues.push(
        issue({
          category: "SEO",
          severity: "HIGH",
          title: "Missing meta description",
          problem: "No meta description was found on the homepage.",
          whyItMatters: "Search engines may generate a less relevant snippet, lowering click-through rate.",
          recommendation: "Write a unique 140–160 character description summarizing the page's value.",
          impact: "HIGH",
          effort: "LOW",
        }),
      );
    } else if (metaDesc.length < 70 || metaDesc.length > 165) {
      issues.push(
        issue({
          category: "SEO",
          severity: "LOW",
          title: "Meta description length is not optimal",
          problem: `The meta description is ${metaDesc.length} characters.`,
          whyItMatters: "Very short or very long descriptions are less compelling or get truncated.",
          recommendation: "Aim for 140–160 characters.",
          evidence: { length: metaDesc.length },
          impact: "LOW",
          effort: "LOW",
        }),
      );
    }

    // --- H1 ----------------------------------------------------------------
    if (h1s.length === 0) {
      issues.push(
        issue({
          category: "SEO",
          severity: "HIGH",
          title: "Missing H1 heading",
          problem: "The page has no H1 element.",
          whyItMatters: "The H1 communicates the primary topic to users and search engines.",
          recommendation: "Add a single, descriptive H1 that states what the page is about.",
          impact: "HIGH",
          effort: "LOW",
        }),
      );
    } else if (h1s.length > 1) {
      issues.push(
        issue({
          category: "SEO",
          severity: "LOW",
          title: "Multiple H1 headings",
          problem: `Found ${h1s.length} H1 elements.`,
          whyItMatters: "Multiple H1s can dilute the page's topical focus.",
          recommendation: "Use one H1 and demote the rest to H2/H3.",
          evidence: { count: h1s.length },
          impact: "LOW",
          effort: "LOW",
        }),
      );
    }

    // --- Heading hierarchy -------------------------------------------------
    const hierarchyBroken = hasHeadingSkips(page.headings.map((h) => h.level));
    if (hierarchyBroken) {
      issues.push(
        issue({
          category: "SEO",
          severity: "LOW",
          title: "Heading hierarchy skips levels",
          problem: "Heading levels jump (e.g. H2 → H4) without intermediate levels.",
          whyItMatters: "A clean hierarchy helps search engines and assistive tech understand structure.",
          recommendation: "Use headings in order without skipping levels.",
          impact: "LOW",
          effort: "LOW",
        }),
      );
    }

    // --- Canonical ---------------------------------------------------------
    if (!canonical) {
      issues.push(
        issue({
          category: "SEO",
          severity: "MEDIUM",
          title: "Missing canonical URL",
          problem: "No <link rel=\"canonical\"> was found.",
          whyItMatters: "Canonicals prevent duplicate-content issues across URL variations.",
          recommendation: "Add a self-referencing canonical tag to the page's preferred URL.",
          impact: "MEDIUM",
          effort: "LOW",
        }),
      );
    }

    // --- Indexability ------------------------------------------------------
    if (noindex) {
      issues.push(
        issue({
          category: "SEO",
          severity: "CRITICAL",
          title: "Page is set to noindex",
          problem: "A robots meta tag contains \"noindex\".",
          whyItMatters: "Search engines will exclude this page entirely from results.",
          recommendation: "Remove noindex unless this page is intentionally hidden.",
          impact: "HIGH",
          effort: "LOW",
        }),
      );
    }

    // --- Sitemap & robots --------------------------------------------------
    if (!ctx.sitemap.present) {
      issues.push(
        issue({
          category: "SEO",
          severity: "MEDIUM",
          title: "No XML sitemap found",
          problem: "We couldn't find a sitemap.xml.",
          whyItMatters: "Sitemaps help search engines discover and prioritize your pages.",
          recommendation: "Publish an XML sitemap and reference it in robots.txt.",
          impact: "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }
    if (!ctx.robots.present) {
      issues.push(
        issue({
          category: "SEO",
          severity: "LOW",
          title: "No robots.txt found",
          problem: "We couldn't find a robots.txt.",
          whyItMatters: "robots.txt lets you guide crawlers and point them to your sitemap.",
          recommendation: "Add a robots.txt, even a permissive one, with a Sitemap directive.",
          impact: "LOW",
          effort: "LOW",
        }),
      );
    }

    // --- Image alt ---------------------------------------------------------
    if (page.images.length > 0 && imagesMissingAlt.length > 0) {
      issues.push(
        issue({
          category: "SEO",
          severity: imagesMissingAlt.length > page.images.length / 2 ? "MEDIUM" : "LOW",
          title: "Images missing alt text",
          problem: `${imagesMissingAlt.length} of ${page.images.length} images have no alt text.`,
          whyItMatters: "Alt text improves image search visibility and accessibility.",
          recommendation: "Add descriptive alt text to meaningful images (empty alt for decorative ones).",
          evidence: { missing: imagesMissingAlt.length, total: page.images.length },
          impact: "MEDIUM",
          effort: "LOW",
        }),
      );
    }

    // --- Social metadata ---------------------------------------------------
    if (!hasOg) {
      issues.push(
        issue({
          category: "SEO",
          severity: "LOW",
          title: "Missing Open Graph tags",
          problem: "No Open Graph metadata was found.",
          whyItMatters: "Open Graph controls how links look when shared on social platforms.",
          recommendation: "Add og:title, og:description, og:image and og:url.",
          impact: "LOW",
          effort: "LOW",
        }),
      );
    }
    if (!hasTwitter) {
      issues.push(
        issue({
          category: "SEO",
          severity: "LOW",
          title: "Missing Twitter/X card tags",
          problem: "No twitter:* metadata was found.",
          whyItMatters: "Card tags control rich previews on X/Twitter.",
          recommendation: "Add twitter:card, twitter:title and twitter:image.",
          impact: "LOW",
          effort: "LOW",
        }),
      );
    }

    // --- Structured data ---------------------------------------------------
    if (!hasStructuredData) {
      issues.push(
        issue({
          category: "SEO",
          severity: "MEDIUM",
          title: "No structured data (schema.org)",
          problem: "No JSON-LD structured data was detected.",
          whyItMatters: "Schema markup enables rich results and helps engines understand your content.",
          recommendation: "Add relevant schema.org JSON-LD (Organization, WebSite, Product, FAQ, etc.).",
          impact: "MEDIUM",
          effort: "MEDIUM",
        }),
      );
    }

    // --- HTTPS -------------------------------------------------------------
    if (!ctx.securityHeaders.https) {
      issues.push(
        issue({
          category: "SEO",
          severity: "HIGH",
          title: "Site is not served over HTTPS",
          problem: "The page was loaded over plain HTTP.",
          whyItMatters: "HTTPS is a ranking signal and required for user trust and modern browser features.",
          recommendation: "Install a TLS certificate and redirect all HTTP traffic to HTTPS.",
          impact: "HIGH",
          effort: "MEDIUM",
        }),
      );
    }

    // --- Score -------------------------------------------------------------
    const score = scoreFromDeductions([
      { points: 22, when: !title },
      { points: 6, when: !!title && (title.length < 15 || title.length > 65) },
      { points: 14, when: !metaDesc },
      { points: 4, when: !!metaDesc && (metaDesc.length < 70 || metaDesc.length > 165) },
      { points: 12, when: h1s.length === 0 },
      { points: 3, when: h1s.length > 1 },
      { points: 3, when: hierarchyBroken },
      { points: 6, when: !canonical },
      { points: 30, when: noindex },
      { points: 6, when: !ctx.sitemap.present },
      { points: 3, when: !ctx.robots.present },
      { points: 6, when: page.images.length > 0 && imagesMissingAlt.length > page.images.length / 2 },
      { points: 3, when: page.images.length > 0 && imagesMissingAlt.length > 0 && imagesMissingAlt.length <= page.images.length / 2 },
      { points: 3, when: !hasOg },
      { points: 3, when: !hasTwitter },
      { points: 8, when: !hasStructuredData },
      { points: 14, when: !ctx.securityHeaders.https },
    ]);

    const summary = buildSummary(score, {
      title: !!title,
      metaDesc: !!metaDesc,
      h1: h1s.length === 1,
      structuredData: hasStructuredData,
      https: ctx.securityHeaders.https,
    });

    return {
      category: "SEO",
      score,
      summary,
      details: {
        title,
        titleLength: title.length,
        metaDescriptionLength: metaDesc.length,
        h1Count: h1s.length,
        canonical: !!canonical,
        noindex,
        sitemap: ctx.sitemap.present,
        robots: ctx.robots.present,
        openGraph: hasOg,
        twitter: hasTwitter,
        structuredData: hasStructuredData,
        imagesMissingAlt: imagesMissingAlt.length,
        https: ctx.securityHeaders.https,
      },
      issues,
    };
  },
};

function hasHeadingSkips(levels: number[]): boolean {
  let prev = 0;
  for (const level of levels) {
    if (prev !== 0 && level > prev + 1) return true;
    prev = level;
  }
  return false;
}

function buildSummary(
  score: number,
  flags: { title: boolean; metaDesc: boolean; h1: boolean; structuredData: boolean; https: boolean },
): string {
  const good: string[] = [];
  const bad: string[] = [];
  (flags.title ? good : bad).push("page title");
  (flags.metaDesc ? good : bad).push("meta description");
  (flags.h1 ? good : bad).push("single H1");
  (flags.structuredData ? good : bad).push("structured data");
  (flags.https ? good : bad).push("HTTPS");

  const parts: string[] = [];
  if (good.length) parts.push(`In place: ${good.join(", ")}.`);
  if (bad.length) parts.push(`Missing or weak: ${bad.join(", ")}.`);
  return `SEO score ${score}/100. ${parts.join(" ")}`;
}
