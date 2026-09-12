// Crawler orchestrator (Phase 2).
//
// Produces the measured AnalysisContext consumed by all analyzers. Enforces
// max pages / depth / timeouts and respects robots.txt. Screenshots are saved
// for the root page (and referenced by key).

import { env } from "@/lib/env";
import { fetchRobots, fetchSitemap } from "@/lib/crawler/robots";
import { renderPage } from "@/lib/crawler/renderer";
import { extractPage, toCrawledPage } from "@/lib/crawler/extract";
import { saveScreenshot } from "@/lib/crawler/screenshots";
import type {
  AnalysisContext,
  CrawledPage,
  SecurityHeaders,
  ViewportMeasurement,
} from "@/lib/engine/types";

export interface CrawlOptions {
  auditId: string;
  rootUrl: string;
  maxPages?: number;
  maxDepth?: number;
  onPage?: (page: CrawledPage) => void;
}

export class CrawlBlockedError extends Error {}
export class CrawlUnreachableError extends Error {}

export async function crawlSite(opts: CrawlOptions): Promise<AnalysisContext> {
  const maxPages = Math.min(opts.maxPages ?? env.crawler.maxPages, env.crawler.maxPages);
  const maxDepth = Math.min(opts.maxDepth ?? env.crawler.maxDepth, env.crawler.maxDepth);

  const root = new URL(opts.rootUrl);
  const origin = root.origin;
  const host = root.hostname.toLowerCase();

  // 1. robots.txt
  const robots = await fetchRobots(origin);
  if (!robots.allowsCrawling) {
    throw new CrawlBlockedError(
      "This website asks automated crawlers not to access it (robots.txt).",
    );
  }

  // 2. sitemap.xml
  const sitemap = await fetchSitemap(origin, robots.sitemaps);

  // 3. BFS crawl starting at the root.
  const pages: CrawledPage[] = [];
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: opts.rootUrl, depth: 0 }];

  let securityHeaders: SecurityHeaders | null = null;
  let viewports: ViewportMeasurement[] | undefined;
  const meta: Record<string, unknown> = { consoleErrors: [], failedRequests: [] };

  while (queue.length && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    const normalized = normalize(url);
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    const render = await renderPage(url);

    // If the very first (root) page is unreachable, fail the whole audit.
    if (pages.length === 0 && !render.ok && !render.html) {
      throw new CrawlUnreachableError(
        render.error ??
          "We couldn't load this website. It may be unavailable or blocking automated browsers.",
      );
    }
    if (!render.html) continue;

    const extracted = extractPage(render.html, render.finalUrl || url, host);
    const pathName = new URL(render.finalUrl || url).pathname;
    const page = toCrawledPage(
      render.html,
      render.finalUrl || url,
      pathName,
      host,
      render.status,
      extracted,
    );

    // Save screenshots for the root page only (keeps storage bounded).
    if (pages.length === 0) {
      // Persist each available viewport screenshot by key, populating the
      // forward-looking screenshots map. Unavailable viewports are omitted.
      const screenshots: Record<string, string> = {};
      for (const cap of render.viewports) {
        if (!cap.screenshot) continue;
        const key = await saveScreenshot(
          `${opts.auditId}-${cap.profile.key}.jpg`,
          cap.screenshot,
        );
        screenshots[cap.profile.key] = key;
      }
      if (Object.keys(screenshots).length > 0) {
        page.screenshots = screenshots;
      }

      // Backward-compatible single-shot fields (desktop + 390px mobile).
      page.desktopScreenshot =
        screenshots.desktop ??
        (render.desktopScreenshot
          ? await saveScreenshot(
              `${opts.auditId}-desktop.jpg`,
              render.desktopScreenshot,
            )
          : undefined);
      page.mobileScreenshot =
        screenshots.mobile ??
        (render.mobileScreenshot
          ? await saveScreenshot(
              `${opts.auditId}-mobile.jpg`,
              render.mobileScreenshot,
            )
          : undefined);

      // Attach per-viewport measurements for the Mobile analyzer.
      viewports = render.viewports
        .filter((c) => c.metrics)
        .map((c) => {
          const m = c.metrics!;
          return {
            key: c.profile.key,
            label: c.profile.label,
            width: m.width,
            scrollWidth: m.scrollWidth,
            overflowPx: m.overflowPx,
            hasHorizontalScroll: m.hasHorizontalScroll,
            baseFontPx: m.baseFontPx,
            smallTextNodes: m.smallTextNodes,
            tapTargetsTotal: m.tapTargets.total,
            tapTargetsTooSmall: m.tapTargets.tooSmall,
            tapTargetExamples: m.tapTargets.examples,
            primaryCtaText: m.primaryCtaText,
            ctaVisibleAboveFold: m.ctaVisibleAboveFold,
            markerCandidates: m.markerCandidates,
          } satisfies ViewportMeasurement;
        });
      if (viewports.length === 0) viewports = undefined;

      securityHeaders = deriveSecurityHeaders(origin, render.responseHeaders, page);
      meta.consoleErrors = render.consoleErrors;
      meta.failedRequests = render.failedRequests;
      meta.rootTimingMs = render.timingMs;
    }

    pages.push(page);
    opts.onPage?.(page);

    // Enqueue internal links for the next depth level.
    if (depth < maxDepth) {
      for (const link of extracted.links) {
        if (!link.internal) continue;
        try {
          const abs = new URL(link.href, render.finalUrl || url);
          if (abs.hostname.toLowerCase() !== host) continue;
          const norm = normalize(abs.toString());
          if (!visited.has(norm) && !queue.some((q) => normalize(q.url) === norm)) {
            queue.push({ url: abs.toString(), depth: depth + 1 });
          }
        } catch {
          // skip bad links
        }
      }
    }
  }

  if (pages.length === 0) {
    throw new CrawlUnreachableError(
      "We couldn't extract any content from this website.",
    );
  }

  return {
    auditId: opts.auditId,
    rootUrl: opts.rootUrl,
    host,
    robots,
    sitemap,
    pages,
    securityHeaders:
      securityHeaders ?? deriveSecurityHeaders(origin, {}, pages[0]),
    viewports,
    measured: meta,
  };
}

function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Treat trailing-slash variants as the same page.
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function deriveSecurityHeaders(
  origin: string,
  headers: Record<string, string>,
  rootPage: CrawledPage,
): SecurityHeaders {
  const h = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const https = origin.startsWith("https:");
  // Mixed content: https page loading http subresources.
  const mixedContent =
    https && /<(?:img|script|link|iframe)[^>]+(?:src|href)=["']http:\/\//i.test(rootPage.html);

  return {
    https,
    hsts: Boolean(h["strict-transport-security"]),
    csp: Boolean(h["content-security-policy"]),
    xFrameOptions: Boolean(h["x-frame-options"]),
    referrerPolicy: Boolean(h["referrer-policy"]),
    permissionsPolicy: Boolean(h["permissions-policy"]),
    mixedContent,
    exposedServerInfo: h["server"] || h["x-powered-by"] || null,
  };
}
