// Renders a standalone HTML document to a PDF using headless Chromium.
//
// This renders TRUSTED, self-contained HTML we generate ourselves (no external
// navigation, screenshots inlined as data URIs), so there is no SSRF surface
// here — we never call page.goto() to a remote URL. The browser is launched on
// demand and closed after use to avoid holding resources between exports.

import type { Browser } from "playwright";

export async function htmlToPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Load our own HTML directly; no network navigation.
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16px", bottom: "16px", left: "0px", right: "0px" },
    });
    return pdf;
  } finally {
    await browser.close().catch(() => {});
  }
}
