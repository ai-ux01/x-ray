// Safe outbound fetch with SSRF re-validation, timeout, and response-size cap.
// Used for lightweight text resources (robots.txt, sitemap.xml, link checks).
// The full page render goes through Playwright (see renderer.ts).

import { env } from "@/lib/env";
import { assertPublicHost } from "@/lib/security/url-guard";

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  url: string;
  finalUrl: string;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  error?: string;
}

export async function safeFetch(
  rawUrl: string,
  init?: { method?: string; maxBytes?: number; timeoutMs?: number },
): Promise<SafeFetchResult> {
  const timeoutMs = init?.timeoutMs ?? env.crawler.requestTimeoutMs;
  const maxBytes = init?.maxBytes ?? env.crawler.maxResponseBytes;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return emptyResult(rawUrl, "Invalid URL.");
  }

  // Re-check the resolved IPs right before the request (DNS rebinding defense).
  try {
    await assertPublicHost(url.hostname);
  } catch (err) {
    return emptyResult(rawUrl, err instanceof Error ? err.message : "Blocked host.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": env.crawler.userAgent, Accept: "*/*" },
    });

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));

    // Stream and cap the body size to avoid memory exhaustion.
    const { body, truncated } = await readCapped(res, maxBytes);

    return {
      ok: res.ok,
      status: res.status,
      url: rawUrl,
      finalUrl: res.url || rawUrl,
      headers,
      body,
      truncated,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return emptyResult(rawUrl, aborted ? "Request timed out." : "Request failed.");
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(
  res: Response,
  maxBytes: number,
): Promise<{ body: string; truncated: boolean }> {
  if (!res.body) {
    const text = await res.text();
    return { body: text.slice(0, maxBytes), truncated: text.length > maxBytes };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      out += decoder.decode(value.slice(0, Math.max(0, maxBytes - (received - value.byteLength))));
      truncated = true;
      await reader.cancel();
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  return { body: out, truncated };
}

function emptyResult(url: string, error: string): SafeFetchResult {
  return {
    ok: false,
    status: 0,
    url,
    finalUrl: url,
    headers: {},
    body: "",
    truncated: false,
    error,
  };
}
