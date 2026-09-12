// In-page measurement script (Phase 5).
//
// `measureViewport` is serialized and executed inside the page via
// `page.evaluate`. It performs pure DOM reads (no network) and returns a
// serializable `ViewportMetrics` object. All marker coordinates are relative
// (0..1) so they render correctly at any displayed image size.
//
// NOTE: the function body runs in the browser context — it must not reference
// anything from the Node module scope. Keep it self-contained.

import type { ViewportMetrics } from "@/lib/engine/types";

/** Legibility threshold (px). Text below this is considered too small. */
export const SMALL_TEXT_PX = 12;
/** Minimum recommended tap-target dimension (px). */
export const MIN_TAP_TARGET_PX = 40;
/** Maximum number of marker candidates returned per viewport. */
export const MAX_MARKERS = 8;

/**
 * Runs inside the browser. Returns measured metrics for the current viewport.
 * Accepts the viewport key plus thresholds so the constants stay in one place.
 */
export function measureViewport(
  key: string,
  smallTextPx: number,
  minTapPx: number,
  maxMarkers: number,
): ViewportMetrics {
  const doc = document.documentElement;
  const width = doc.clientWidth;
  const scrollWidth = doc.scrollWidth;
  const overflowPx = Math.max(0, scrollWidth - width);
  const viewportHeight = window.innerHeight || doc.clientHeight;

  const docW = Math.max(scrollWidth, width, 1);
  const docH = Math.max(doc.scrollHeight, doc.clientHeight, 1);

  const rel = (v: number, total: number) =>
    Math.min(1, Math.max(0, v / total));

  const markerCandidates: {
    relX: number;
    relY: number;
    relW?: number;
    relH?: number;
    label: string;
    kind: "overflow" | "small-text" | "tap-target" | "cta";
  }[] = [];

  const isVisible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }
    return true;
  };

  // --- Base font size -------------------------------------------------------
  const bodyStyle = window.getComputedStyle(document.body);
  const baseFontPx = parseFloat(bodyStyle.fontSize) || 16;

  // --- Small text nodes -----------------------------------------------------
  let smallTextNodes = 0;
  const textEls = Array.from(
    document.querySelectorAll<HTMLElement>(
      "p, span, li, a, button, label, td, th, h1, h2, h3, h4, h5, h6, div",
    ),
  );
  for (const el of textEls) {
    const direct = Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
    );
    if (!direct) continue;
    if (!isVisible(el)) continue;
    const fs = parseFloat(window.getComputedStyle(el).fontSize);
    if (fs && fs < smallTextPx) {
      smallTextNodes++;
      if (markerCandidates.length < maxMarkers) {
        const r = el.getBoundingClientRect();
        markerCandidates.push({
          relX: rel(r.left + window.scrollX + r.width / 2, docW),
          relY: rel(r.top + window.scrollY + r.height / 2, docH),
          label: "Text too small to read",
          kind: "small-text",
        });
      }
    }
  }

  // --- Tap targets ----------------------------------------------------------
  const interactiveEls = Array.from(
    document.querySelectorAll<HTMLElement>(
      "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [onclick]",
    ),
  );
  let tapTotal = 0;
  let tapTooSmall = 0;
  const tapExamples: { tag: string; text: string; w: number; h: number }[] = [];
  const tapMarkers: typeof markerCandidates = [];
  for (const el of interactiveEls) {
    if (!isVisible(el)) continue;
    tapTotal++;
    const r = el.getBoundingClientRect();
    if (r.width < minTapPx || r.height < minTapPx) {
      tapTooSmall++;
      if (tapExamples.length < 5) {
        tapExamples.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
      tapMarkers.push({
        relX: rel(r.left + window.scrollX + r.width / 2, docW),
        relY: rel(r.top + window.scrollY + r.height / 2, docH),
        relW: rel(r.width, docW),
        relH: rel(r.height, docH),
        label: "Tap target too small",
        kind: "tap-target",
      });
    }
  }
  for (const m of tapMarkers) {
    if (markerCandidates.length >= maxMarkers) break;
    markerCandidates.push(m);
  }

  // --- CTA heuristic --------------------------------------------------------
  // A "primary CTA" is a prominent link/button whose text signals action.
  const ctaWords =
    /\b(sign\s?up|get\s?started|start|buy|try|subscribe|contact|book|demo|download|shop|order|join|register|request)\b/i;
  const ctaCandidates = interactiveEls.filter((el) => {
    if (!isVisible(el)) return false;
    const tag = el.tagName.toLowerCase();
    if (tag !== "a" && tag !== "button" && el.getAttribute("role") !== "button")
      return false;
    return ctaWords.test((el.textContent ?? "").trim());
  });
  let primaryCtaText: string | undefined;
  let ctaVisibleAboveFold = false;
  if (ctaCandidates.length > 0) {
    // Choose the largest CTA by area as the "primary" one.
    let best = ctaCandidates[0];
    let bestArea = 0;
    for (const el of ctaCandidates) {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    primaryCtaText = (best.textContent ?? "").trim().slice(0, 60);
    ctaVisibleAboveFold = ctaCandidates.some((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      return top < viewportHeight && r.bottom > 0;
    });
  }

  // --- Overflow marker ------------------------------------------------------
  if (overflowPx > 0 && markerCandidates.length < maxMarkers) {
    markerCandidates.push({
      relX: 0.92,
      relY: 0.08,
      label: "Content overflows the screen (horizontal scroll)",
      kind: "overflow",
    });
  }

  return {
    key,
    width,
    scrollWidth,
    overflowPx,
    hasHorizontalScroll: overflowPx > 1,
    baseFontPx,
    smallTextNodes,
    tapTargets: {
      total: tapTotal,
      tooSmall: tapTooSmall,
      examples: tapExamples,
    },
    primaryCtaText,
    ctaVisibleAboveFold,
    markerCandidates: markerCandidates.slice(0, maxMarkers),
  };
}
