// robots.txt + sitemap.xml fetching and parsing.
// We respect robots directives for our own user-agent as a good crawler.

import { safeFetch } from "@/lib/crawler/safe-fetch";
import type { RobotsInfo, SitemapInfo } from "@/lib/engine/types";

export async function fetchRobots(origin: string): Promise<RobotsInfo> {
  const res = await safeFetch(new URL("/robots.txt", origin).toString(), {
    maxBytes: 512 * 1024,
  });

  if (!res.ok || !res.body.trim()) {
    // No robots.txt means crawling is implicitly allowed.
    return { present: false, allowsCrawling: true, sitemaps: [] };
  }

  const sitemaps: string[] = [];
  let allowsCrawling = true;
  let appliesToUs = false;

  for (const line of res.body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [rawKey, ...rest] = trimmed.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "sitemap" && value) {
      sitemaps.push(value);
    } else if (key === "user-agent") {
      appliesToUs = value === "*";
    } else if (key === "disallow" && appliesToUs) {
      // A blanket "Disallow: /" for * means we shouldn't crawl.
      if (value === "/") allowsCrawling = false;
    }
  }

  return { present: true, allowsCrawling, sitemaps, raw: res.body.slice(0, 4000) };
}

export async function fetchSitemap(
  origin: string,
  hinted: string[],
): Promise<SitemapInfo> {
  const candidates = hinted.length
    ? hinted
    : [new URL("/sitemap.xml", origin).toString()];

  for (const candidate of candidates) {
    const res = await safeFetch(candidate, { maxBytes: 2 * 1024 * 1024 });
    if (!res.ok || !res.body.includes("<")) continue;

    // Extract <loc> entries (handles both urlset and sitemapindex).
    const urls = Array.from(res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map(
      (m) => m[1].trim(),
    );
    if (urls.length) {
      return { present: true, urlCount: urls.length, urls: urls.slice(0, 500) };
    }
  }

  return { present: false, urlCount: 0, urls: [] };
}
