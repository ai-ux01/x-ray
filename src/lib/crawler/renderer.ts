// Playwright-based page renderer.
//
// Renders a page in a sandboxed headless Chromium, captures desktop + mobile
// screenshots, records console/network errors, and returns the final HTML.
// SSRF re-validation happens before navigation; requests to private hosts are
// aborted at the browser routing layer too (defense in depth).

import type { Browser, BrowserContext } from "playwright";
import { env } from "@/lib/env";
import { assertPublicHost, isPrivateIp } from "@/lib/security/url-guard";
import {
  VIEWPORT_PROFILES,
  type ViewportProfile,
} from "@/lib/crawler/viewports";
import {
  measureViewport,
  SMALL_TEXT_PX,
  MIN_TAP_TARGET_PX,
  MAX_MARKERS,
} from "@/lib/crawler/measure";
import type { ViewportMetrics } from "@/lib/engine/types";

export interface ViewportCapture {
  profile: ViewportProfile;
  /** null when measurement failed for this viewport. */
  metrics: ViewportMetrics | null;
  /** undefined when the screenshot failed for this viewport. */
  screenshot?: Buffer;
}

export interface RenderResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  html: string;
  desktopScreenshot?: Buffer;
  mobileScreenshot?: Buffer;
  /** Per-viewport captures (best-effort; one failure never aborts others). */
  viewports: ViewportCapture[];
  consoleErrors: string[];
  failedRequests: { url: string; failure: string }[];
  responseHeaders: Record<string, string>;
  timingMs: number;
  error?: string;
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = import("playwright").then(({ chromium }) =>
      chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          // Reduce fingerprint / resource use.
          "--disable-extensions",
        ],
      }),
    );
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

const DESKTOP_PROFILE =
  VIEWPORT_PROFILES.find((p) => p.key === "desktop") ?? VIEWPORT_PROFILES[0];

export async function renderPage(rawUrl: string): Promise<RenderResult> {
  const start = Date.now();
  const consoleErrors: string[] = [];
  const failedRequests: { url: string; failure: string }[] = [];
  let responseHeaders: Record<string, string> = {};
  let status = 0;
  let finalUrl = rawUrl;
  let html = "";

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return errorResult("Invalid URL.", start);
  }

  try {
    await assertPublicHost(url.hostname);
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : "Blocked host.", start);
  }

  let context: BrowserContext | null = null;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: env.crawler.userAgent,
      viewport: { width: DESKTOP_PROFILE.width, height: DESKTOP_PROFILE.height },
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true,
    });
    context.setDefaultNavigationTimeout(env.crawler.requestTimeoutMs);
    context.setDefaultTimeout(env.crawler.requestTimeoutMs);

    const page = await context.newPage();

    // Block navigation/subrequests to private IPs at the routing layer.
    await page.route("**/*", async (route) => {
      const reqUrl = route.request().url();
      try {
        const host = new URL(reqUrl).hostname;
        if (!env.crawler.allowPrivateIps && isPrivateIp(host)) {
          return route.abort();
        }
      } catch {
        // ignore
      }
      return route.continue();
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on("requestfailed", (req) => {
      const f = req.failure();
      if (f) failedRequests.push({ url: req.url().slice(0, 300), failure: f.errorText });
    });

    const response = await page.goto(rawUrl, { waitUntil: "domcontentloaded" });
    status = response?.status() ?? 0;
    finalUrl = page.url();
    if (response) {
      const h = response.headers();
      responseHeaders = h;
    }

    // Give client-rendered content a brief settle window (bounded).
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});

    html = await page.content();

    // Multi-viewport capture: resize the SAME already-loaded page across each
    // profile (no new navigation → SSRF guard untouched, Req 6.1), measure the
    // DOM at that width, then screenshot. Each capture is isolated so one
    // failure does not abort the others (Req 1.3).
    const captures: ViewportCapture[] = [];
    for (const profile of VIEWPORT_PROFILES) {
      const capture: ViewportCapture = { profile, metrics: null };
      try {
        await page.setViewportSize({
          width: profile.width,
          height: profile.height,
        });
        // Brief settle for reflow / responsive breakpoints.
        await page.waitForTimeout(250);

        capture.metrics = await page
          .evaluate(
            // measureViewport is self-contained (no Node-scope refs), so
            // Playwright can serialize it to run in the page context.
            ({ fn, args }) => {
              const f = new Function(`return (${fn})`)() as (
                ...a: unknown[]
              ) => ViewportMetrics;
              return f(...args);
            },
            {
              fn: measureViewport.toString(),
              args: [profile.key, SMALL_TEXT_PX, MIN_TAP_TARGET_PX, MAX_MARKERS],
            },
          )
          .catch(() => null);

        capture.screenshot = await page
          .screenshot({ fullPage: false, type: "jpeg", quality: 70 })
          .then((b) => b ?? undefined)
          .catch(() => undefined);
      } catch {
        // Leave metrics null / screenshot undefined; continue with the rest.
      }
      captures.push(capture);
    }

    // Backward-compatible single-shot fields.
    const desktopCap = captures.find((c) => c.profile.key === "desktop");
    const mobileCap = captures.find((c) => c.profile.key === "mobile");

    return {
      ok: status > 0 && status < 400,
      status,
      finalUrl,
      html,
      desktopScreenshot: desktopCap?.screenshot,
      mobileScreenshot: mobileCap?.screenshot,
      viewports: captures,
      consoleErrors,
      failedRequests,
      responseHeaders,
      timingMs: Date.now() - start,
    };
  } catch (err) {
    const message =
      err instanceof Error && /timeout/i.test(err.message)
        ? "The website took too long to respond."
        : "We couldn't load this website. It may be unavailable or blocking automated browsers.";
    return {
      ...errorResult(message, start),
      consoleErrors,
      failedRequests,
    };
  } finally {
    await context?.close().catch(() => {});
  }
}

function errorResult(error: string, start: number): RenderResult {
  return {
    ok: false,
    status: 0,
    finalUrl: "",
    html: "",
    viewports: [],
    consoleErrors: [],
    failedRequests: [],
    responseHeaders: {},
    timingMs: Date.now() - start,
    error,
  };
}
