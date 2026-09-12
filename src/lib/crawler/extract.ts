// HTML extraction with Cheerio. Produces structured, non-sensitive facts used
// by the analyzers. Pure parsing — no network, no side effects.

import * as cheerio from "cheerio";
import type { CrawledPage } from "@/lib/engine/types";

export interface ExtractedMeta {
  title?: string;
  metaDescription?: string;
  canonical?: string;
  robotsMeta?: string;
  viewport?: string;
  charset?: string;
  lang?: string;
  favicon?: string;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
}

export interface ExtractedPage {
  meta: ExtractedMeta;
  headings: { level: number; text: string }[];
  links: { href: string; text: string; internal: boolean }[];
  images: { src: string; alt: string | null }[];
  forms: { hasLabels: boolean; inputCount: number }[];
  structuredData: unknown[];
  domNodeCount: number;
  wordCount: number;
  textSample: string;
}

export function extractPage(html: string, pageUrl: string, host: string): ExtractedPage {
  const $ = cheerio.load(html);

  const openGraph: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  $("meta").each((_, el) => {
    const property = $(el).attr("property")?.toLowerCase();
    const name = $(el).attr("name")?.toLowerCase();
    const content = $(el).attr("content") ?? "";
    if (property?.startsWith("og:")) openGraph[property] = content;
    if (name?.startsWith("twitter:")) twitter[name] = content;
  });

  const meta: ExtractedMeta = {
    title: $("title").first().text().trim() || undefined,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || undefined,
    canonical: $('link[rel="canonical"]').attr("href")?.trim() || undefined,
    robotsMeta: $('meta[name="robots"]').attr("content")?.trim() || undefined,
    viewport: $('meta[name="viewport"]').attr("content")?.trim() || undefined,
    charset:
      $("meta[charset]").attr("charset") ||
      $('meta[http-equiv="Content-Type"]').attr("content") ||
      undefined,
    lang: $("html").attr("lang")?.trim() || undefined,
    favicon:
      $('link[rel="icon"], link[rel="shortcut icon"]').first().attr("href")?.trim() ||
      undefined,
    openGraph,
    twitter,
  };

  const headings: { level: number; text: string }[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = Number(el.tagName.substring(1));
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (text) headings.push({ level, text: text.slice(0, 200) });
  });

  const links: { href: string; text: string; internal: boolean }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    let internal = false;
    try {
      const resolved = new URL(href, pageUrl);
      internal = resolved.hostname.toLowerCase() === host;
    } catch {
      internal = !/^https?:\/\//i.test(href);
    }
    links.push({
      href: href.slice(0, 500),
      text: $(el).text().trim().slice(0, 120),
      internal,
    });
  });

  const images: { src: string; alt: string | null }[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    if (!src) return;
    const alt = $(el).attr("alt");
    images.push({ src: src.slice(0, 500), alt: alt === undefined ? null : alt });
  });

  const forms: { hasLabels: boolean; inputCount: number }[] = [];
  $("form").each((_, el) => {
    const inputs = $(el).find("input, textarea, select");
    const labels = $(el).find("label");
    forms.push({ hasLabels: labels.length > 0, inputCount: inputs.length });
  });

  const structuredData: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      structuredData.push(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON-LD.
    }
  });

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : 0;

  return {
    meta,
    headings,
    links,
    images,
    forms,
    structuredData,
    domNodeCount: $("*").length,
    wordCount,
    textSample: bodyText.slice(0, 5000),
  };
}

export function toCrawledPage(
  html: string,
  pageUrl: string,
  path: string,
  host: string,
  httpStatus: number,
  extracted: ExtractedPage,
): CrawledPage {
  return {
    url: pageUrl,
    path,
    httpStatus,
    html,
    title: extracted.meta.title,
    metaDescription: extracted.meta.metaDescription,
    headings: extracted.headings,
    links: extracted.links,
    images: extracted.images,
    forms: extracted.forms,
    structuredData: extracted.structuredData,
  };
}
