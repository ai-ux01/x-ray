// Lighthouse performance auditing.
//
// Lighthouse drives its own headless Chrome (via chrome-launcher) over the
// DevTools protocol. We run only the performance category and extract Core Web
// Vitals + resource metrics. SSRF is re-checked before launch. Failures are
// non-fatal: the pipeline degrades gracefully to null metrics.

import { env } from "@/lib/env";
import { assertPublicHost } from "@/lib/security/url-guard";

export interface LighthouseMetrics {
  performanceScore: number | null; // 0..100
  lcp: number | null; // ms
  cls: number | null; // unitless
  fcp: number | null; // ms
  ttfb: number | null; // ms
  tbt: number | null; // ms (Total Blocking Time — proxy for INP in lab)
  speedIndex: number | null; // ms
  // Resource weights
  totalBytes: number | null;
  scriptBytes: number | null;
  styleBytes: number | null;
  imageBytes: number | null;
  // Opportunity flags
  renderBlocking: boolean;
  usesTextCompression: boolean | null;
  usesResponsiveImages: boolean | null;
  offscreenImages: boolean | null; // true => lazy-load opportunity exists
  thirdPartyCount: number | null;
  available: boolean;
  error?: string;
}

const UNAVAILABLE: LighthouseMetrics = {
  performanceScore: null,
  lcp: null,
  cls: null,
  fcp: null,
  ttfb: null,
  tbt: null,
  speedIndex: null,
  totalBytes: null,
  scriptBytes: null,
  styleBytes: null,
  imageBytes: null,
  renderBlocking: false,
  usesTextCompression: null,
  usesResponsiveImages: null,
  offscreenImages: null,
  thirdPartyCount: null,
  available: false,
};

export async function runLighthouse(rawUrl: string): Promise<LighthouseMetrics> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ...UNAVAILABLE, error: "Invalid URL." };
  }

  try {
    await assertPublicHost(url.hostname);
  } catch (err) {
    return { ...UNAVAILABLE, error: err instanceof Error ? err.message : "Blocked host." };
  }

  let chrome: import("chrome-launcher").LaunchedChrome | null = null;
  try {
    const chromeLauncher = await import("chrome-launcher");
    const lighthouseMod = await import("lighthouse");
    const lighthouse = lighthouseMod.default;

    chrome = await chromeLauncher.launch({
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
    });

    const runnerResult = await lighthouse(
      rawUrl,
      {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance"],
        maxWaitForLoad: env.crawler.requestTimeoutMs + 20000,
      },
      undefined,
    );

    if (!runnerResult) return { ...UNAVAILABLE, error: "Lighthouse returned no result." };

    const lhr = runnerResult.lhr;
    const audits = lhr.audits;
    const perfScore = lhr.categories.performance?.score;

    const numeric = (id: string): number | null => {
      const v = audits[id]?.numericValue;
      return typeof v === "number" ? Math.round(v) : null;
    };

    // Resource summary (bytes by type).
    const resourceSummary = audits["resource-summary"]?.details as
      | { items?: { resourceType: string; transferSize: number }[] }
      | undefined;
    const byType = (type: string): number | null => {
      const item = resourceSummary?.items?.find((i) => i.resourceType === type);
      return item ? Math.round(item.transferSize) : null;
    };

    const thirdParty = audits["third-party-summary"]?.details as
      | { items?: unknown[] }
      | undefined;

    return {
      performanceScore: typeof perfScore === "number" ? Math.round(perfScore * 100) : null,
      lcp: numeric("largest-contentful-paint"),
      cls:
        typeof audits["cumulative-layout-shift"]?.numericValue === "number"
          ? Number(audits["cumulative-layout-shift"].numericValue.toFixed(3))
          : null,
      fcp: numeric("first-contentful-paint"),
      ttfb: numeric("server-response-time"),
      tbt: numeric("total-blocking-time"),
      speedIndex: numeric("speed-index"),
      totalBytes: byType("total"),
      scriptBytes: byType("script"),
      styleBytes: byType("stylesheet"),
      imageBytes: byType("image"),
      renderBlocking: (audits["render-blocking-resources"]?.score ?? 1) < 1,
      usesTextCompression: scoreToBool(audits["uses-text-compression"]?.score),
      usesResponsiveImages: scoreToBool(audits["uses-responsive-images"]?.score),
      offscreenImages: audits["offscreen-images"]?.score != null
        ? (audits["offscreen-images"]!.score as number) < 1
        : null,
      thirdPartyCount: thirdParty?.items?.length ?? null,
      available: true,
    };
  } catch (err) {
    return {
      ...UNAVAILABLE,
      error:
        err instanceof Error
          ? `Lighthouse failed: ${err.message.slice(0, 120)}`
          : "Lighthouse failed.",
    };
  } finally {
    try {
      await chrome?.kill();
    } catch {
      /* ignore */
    }
  }
}

function scoreToBool(score: number | null | undefined): boolean | null {
  if (score == null) return null;
  return score >= 1;
}
