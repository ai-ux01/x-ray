// Accessibility audit via axe-core running inside a Playwright page.
// Produces WCAG rule violations grouped by impact. Non-fatal on failure.

import { env } from "@/lib/env";
import { assertPublicHost, isPrivateIp } from "@/lib/security/url-guard";

export interface AxeViolation {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  help: string;
  description: string;
  nodes: number;
  wcagTags: string[];
}

export interface AxeResult {
  available: boolean;
  violations: AxeViolation[];
  passes: number;
  incomplete: number;
  error?: string;
}

export async function runAxe(rawUrl: string): Promise<AxeResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { available: false, violations: [], passes: 0, incomplete: 0, error: "Invalid URL." };
  }

  try {
    await assertPublicHost(url.hostname);
  } catch (err) {
    return {
      available: false,
      violations: [],
      passes: 0,
      incomplete: 0,
      error: err instanceof Error ? err.message : "Blocked host.",
    };
  }

  let browser: import("playwright").Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    const { AxeBuilder } = await import("@axe-core/playwright");

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const context = await browser.newContext({ userAgent: env.crawler.userAgent });
    context.setDefaultNavigationTimeout(env.crawler.requestTimeoutMs);
    const page = await context.newPage();

    await page.route("**/*", (route) => {
      try {
        const host = new URL(route.request().url()).hostname;
        if (!env.crawler.allowPrivateIps && isPrivateIp(host)) return route.abort();
      } catch {
        /* ignore */
      }
      return route.continue();
    });

    await page.goto(rawUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const violations: AxeViolation[] = results.violations.map((v) => ({
      id: v.id,
      impact: (v.impact as AxeViolation["impact"]) ?? null,
      help: v.help,
      description: v.description,
      nodes: v.nodes.length,
      wcagTags: v.tags.filter((t) => t.startsWith("wcag")),
    }));

    return {
      available: true,
      violations,
      passes: results.passes.length,
      incomplete: results.incomplete.length,
    };
  } catch (err) {
    return {
      available: false,
      violations: [],
      passes: 0,
      incomplete: 0,
      error: err instanceof Error ? `axe failed: ${err.message.slice(0, 120)}` : "axe failed.",
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
