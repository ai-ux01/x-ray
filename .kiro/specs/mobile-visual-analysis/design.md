# Design Document

## Overview

Phase 5 adds **Mobile Experience analysis** and **Visual analysis with a
"Show Issues" overlay** to WebsiteX-Ray. It extends four existing subsystems
without changing their contracts:

- **Renderer** (`src/lib/crawler/renderer.ts`) — gains multi-viewport capture
  and an in-page measurement script.
- **Engine types + crawler orchestrator** — carry per-viewport metrics and
  extra screenshot keys into the `AnalysisContext`.
- **Analyzer registry** — a new `mobileAnalyzer` (category `MOBILE`) produces a
  measured score + issues + visual markers.
- **Report dashboard** — renders per-viewport screenshots and an accessible,
  toggleable numbered-marker overlay.

The design follows existing conventions: measured-only findings, transparent
deduction-based scoring, skip-not-fabricate on measurement failure, single
shared browser, and SSRF re-validation on every navigation.

## Architecture

```
crawlSite() ──► renderPageMultiViewport()   (extends renderPage)
                   │  for each viewport: resize → settle → measure → screenshot
                   ▼
        ViewportRenderResult[]  (metrics + screenshot buffers, per viewport)
                   │  crawler saves screenshots by key, attaches metrics
                   ▼
        AnalysisContext.viewports  +  page.screenshots{viewport→key}
                   │
                   ▼
        mobileAnalyzer.analyze(ctx)  ──► CategoryResult(MOBILE) + markers
                   │  measured issues (overflow, font, tap targets, CTA)
                   ▼
        persistResults() (existing) + persistMarkers() (new)
                   │
                   ▼
   Report page loads scores + issues + AuditVisualMarker[] grouped by viewport
                   ▼
   <ScreenshotViewer> renders image + <IssueOverlay> (Show Issues toggle)
```

### Design decision: one context, resized per viewport

The current renderer already resizes a single page from desktop → mobile. We
generalize that to a list of viewports, resizing the **same page** between
captures. This keeps us to a single browser launch and a single navigation
(bounded by the existing timeout), satisfying Requirement 1.5. We measure the
DOM *at each width* via `page.evaluate` after a short settle, then screenshot.

Trade-off: resizing reuses the already-loaded page rather than reloading per
viewport. This is faster and sufficient for layout/overflow/tap-target checks.
Media that only loads on reload (rare) is an accepted limitation, documented.

## Components and Interfaces

### 1. Viewport definitions

```ts
// src/lib/crawler/viewports.ts
export interface ViewportProfile {
  key: "mobile-sm" | "mobile" | "tablet" | "desktop";
  label: string;          // "Mobile (375px)"
  width: number;
  height: number;
  isMobile: boolean;      // touch + mobile UA hints
  deviceScaleFactor: number;
}

export const VIEWPORT_PROFILES: ViewportProfile[]; // 375, 390, 768, 1440
```

### 2. In-page measurement script

Runs via `page.evaluate` at each viewport. Pure DOM reads; no network.

```ts
// Returned per viewport (serializable).
export interface ViewportMetrics {
  key: string;
  width: number;                 // layout viewport width
  scrollWidth: number;           // documentElement.scrollWidth
  overflowPx: number;            // max(0, scrollWidth - width)
  hasHorizontalScroll: boolean;
  baseFontPx: number;            // computed font-size on body
  smallTextNodes: number;        // visible text elements < 12px
  tapTargets: {
    total: number;
    tooSmall: number;            // < 40x40 effective, visible, interactive
    examples: { tag: string; text: string; w: number; h: number }[];
  };
  // CTA heuristic inputs
  primaryCtaText?: string;       // best-guess CTA label (measured on desktop)
  ctaVisibleAboveFold: boolean;  // is a CTA within [0, viewportHeight)?
  // Marker candidates with relative coordinates (0..1)
  markerCandidates: MarkerCandidate[];
}

export interface MarkerCandidate {
  relX: number; relY: number; relW?: number; relH?: number;
  label: string;                 // "Tap target too small"
  kind: "overflow" | "small-text" | "tap-target" | "cta";
}
```

The script computes bounding rects, divides by the screenshot dimensions to get
relative coordinates (Requirement 4.6), and caps the number of marker
candidates (e.g. ≤ 8) to keep the overlay readable.

### 3. Renderer extension

```ts
// src/lib/crawler/renderer.ts
export interface ViewportCapture {
  profile: ViewportProfile;
  metrics: ViewportMetrics | null;   // null if measurement failed
  screenshot?: Buffer;               // undefined if capture failed
}

export interface RenderResult {
  // ...existing fields unchanged...
  viewports: ViewportCapture[];      // NEW: one per profile, best-effort
}
```

`renderPage` keeps returning `desktopScreenshot`/`mobileScreenshot` for
backward compatibility (mapped from the desktop and 390px captures), so the
crawler and existing report code keep working. Each viewport capture is wrapped
in try/catch so one failure does not abort the others (Requirement 1.3).

### 4. AnalysisContext + CrawledPage additions

```ts
// src/lib/engine/types.ts
export interface CrawledPage {
  // ...existing...
  // Backward-compatible extras:
  screenshots?: Partial<Record<string, string>>; // viewportKey -> storage key
}

export interface ViewportMeasurement {
  key: string;
  label: string;
  width: number;
  scrollWidth: number;
  overflowPx: number;
  hasHorizontalScroll: boolean;
  baseFontPx: number;
  smallTextNodes: number;
  tapTargetsTotal: number;
  tapTargetsTooSmall: number;
  ctaVisibleAboveFold: boolean;
  markerCandidates: MarkerCandidate[];
}

export interface AnalysisContext {
  // ...existing...
  viewports?: ViewportMeasurement[]; // root-page measurements per viewport
}
```

Existing `desktopScreenshot`/`mobileScreenshot` fields on `CrawledPage` remain;
`screenshots` is the richer, forward-looking map.

### 5. Mobile analyzer

```ts
// src/lib/engine/analyzers/mobile.ts
export const mobileAnalyzer: Analyzer = { category: "MOBILE", analyze };
```

Behavior:

- If `ctx.viewports` is missing/empty → return `{ score: 0, details:{available:false} }`
  so the pipeline **skips** persistence (Requirement 2.8), matching Performance/A11y.
- Reads the mobile profiles (375/390) primarily; tablet informs severity.
- Emits measured issues (each with evidence) for:
  - **Overflow / horizontal scroll** (Req 2.2)
  - **Text too small** (Req 2.3)
  - **Tap targets too small** (Req 2.4)
  - **Missing viewport meta** — detected from HTML; to avoid double-counting
    with the Technical analyzer (Req 2.5), the Mobile analyzer applies only a
    small deduction and defers the primary penalty to Technical.
  - **Mobile CTA not visible** — only when a desktop CTA was confidently found
    AND it is not above the mobile fold; otherwise no issue (Req 2.6).
- Builds visual markers from `markerCandidates` for the mobile viewport.
- Score via `scoreFromDeductions` (existing helper) — fully traceable (Req 2.7).

Pure helper functions (unit-tested): `overflowDeduction`, `fontDeduction`,
`tapTargetDeduction`, `computeMobileScore`.

### 6. Marker persistence (extends CategoryResult)

To avoid a broad interface change, markers travel on `CategoryResult.details`
under a well-known key and are persisted by a new step:

```ts
// CategoryResult.details.markers?: VisualMarker[]
export interface VisualMarker {
  viewport: string;      // profile key
  relX: number; relY: number; relW?: number; relH?: number;
  index: number;         // 1-based display number
  label: string;
  category: ScoreCategory;
  severity: Severity;
  source: "MEASURED";    // AI reserved for later
}
```

`persistResults` (or a small `persistMarkers`) writes them to a new table.

## Data Models

New Prisma model (additive migration; no changes to existing models):

```prisma
model AuditVisualMarker {
  id        String        @id @default(cuid())
  auditId   String
  audit     Audit         @relation(fields: [auditId], references: [id], onDelete: Cascade)
  pageId    String?
  page      AuditPage?    @relation(fields: [pageId], references: [id], onDelete: SetNull)

  viewport  String        // "mobile" | "desktop" | ...
  index     Int           // 1-based marker number shown in the overlay
  relX      Float         // 0..1
  relY      Float         // 0..1
  relW      Float?
  relH      Float?

  label     String
  category  ScoreCategory
  severity  Severity
  source    FindingSource @default(MEASURED)

  createdAt DateTime      @default(now())

  @@index([auditId])
  @@index([auditId, viewport])
}
```

`Audit` and `AuditPage` gain a back-relation field `visualMarkers`. Screenshot
keys continue to live on `AuditPage` (existing `desktopShot`/`mobileShot`); a
`screenshots Json?` column may be added to `AuditPage` to store the full
viewport→key map, or we reuse `extracted` — decision: add `screenshots Json?`
for clarity.

Local dev uses SQLite via the generated schema (`npm run db:dev:push`);
production uses PostgreSQL. `Float`, `Json`, and the enums are supported on both.

## UI Components

### `<ScreenshotViewer>` (client component)

- Props: `{ viewport, label, src, markers }`.
- Renders the image in a positioned container; when markers exist, shows a
  **"Show Issues"** toggle (Req 4.1). Hidden/disabled when `markers.length === 0`
  (Req 4.5).
- Uses relative coordinates × rendered box size, so it is resolution-independent
  (Req 4.6).

### `<IssueOverlay>` (inside viewer)

- Absolutely-positioned numbered buttons (`<button>`), each with
  `aria-label="Issue N: <label>"` and a tooltip/popover for the explanation.
- Fully keyboard reachable and number-as-text (Req 4.4). Focus/hover reveals the
  label (Req 4.3).

### Report page wiring

- Query adds `visualMarkers` and reads `AuditPage.screenshots`.
- Renders a "Mobile & Visual" section: desktop + mobile viewers side by side,
  markers grouped by viewport (Req 5.3), each viewer independently toggleable.
- Missing screenshots are omitted (Req 3.2).

## Error Handling

- **Per-viewport failure**: try/catch around each capture; failed viewport →
  `screenshot: undefined`, `metrics: null`; audit proceeds (Req 1.3, 6.2).
- **Whole render failure**: unchanged existing behavior (root unreachable →
  audit fails with friendly message).
- **Mobile analyzer throw**: isolated by the pipeline's per-analyzer try/catch
  (existing) (Req 6.2).
- **Measurement unavailable**: analyzer returns `available:false` → skipped, not
  a fabricated 0 (Req 2.8).
- **SSRF**: every navigation still goes through `assertPublicHost` + the route
  guard; resizing an already-loaded page adds no new navigation (Req 6.1).

## Testing Strategy

Unit tests (Vitest, pure functions — no browser needed):

- `mobile.test.ts`: `overflowDeduction`, `fontDeduction`, `tapTargetDeduction`,
  `computeMobileScore` — boundary cases (exactly 12px, exactly 40px, zero
  overflow, large overflow), and the skip path when viewports are absent.
- `markers.test.ts`: relative-coordinate clamping (0..1), max-marker cap,
  1-based indexing.
- Regression: existing `url-guard.test.ts`, build, and typecheck stay green
  (Req 6.3).

Manual/integration verification (as in prior phases):

- Run an audit against a known-good responsive site (expect high Mobile score,
  few/no markers) and a known-poor/non-responsive page (expect overflow +
  tap-target markers and a lower score) to confirm the analyzer differentiates
  using real measured data.

## Correctness Properties

These invariants must hold for the pure logic and are the basis for the unit /
property-based tests. Each maps to acceptance criteria.

### Property 1: Score is bounded
For any set of measured inputs, `computeMobileScore` returns an integer in
`[0, 100]`.

**Validates: Requirements 2.1, 2.7**

### Property 2: Score is monotonic in defects
Adding a defect (more overflow px, more small-text nodes, more too-small tap
targets) never increases the score; removing all defects yields 100.

**Validates: Requirements 2.7**

### Property 3: Deductions are traceable
The final score equals `100 − Σ(applied deductions)` clamped to `[0, 100]`;
every applied deduction corresponds to at least one emitted issue.

**Validates: Requirements 2.7**

### Property 4: No overflow implies no overflow issue
If `scrollWidth ≤ width` for all mobile viewports, no overflow/horizontal-scroll
issue or marker is produced.

**Validates: Requirements 2.2**

### Property 5: Threshold correctness
Font sizes `≥ 12px` never trigger the small-text issue; tap targets `≥ 40×40`
never count as too small (boundary inclusive).

**Validates: Requirements 2.3, 2.4**

### Property 6: CTA has no false positives
A mobile-CTA issue is produced only when a desktop CTA was confidently
identified AND it is not above the mobile fold; otherwise never.

**Validates: Requirements 2.6**

### Property 7: Markers are normalized
Every persisted marker has `relX, relY ∈ [0, 1]` (and `relW, relH ∈ [0, 1]` when
present), a unique 1-based `index` within its viewport, and the total marker
count per viewport is capped.

**Validates: Requirements 4.2, 4.6**

### Property 8: Skip is honest
When no viewport measurements exist, the analyzer returns `available:false` and
produces no score, no issues, and no markers, so the overall score excludes
MOBILE.

**Validates: Requirements 2.8, 6.4**

## Backward Compatibility & Rollout

- All schema changes are additive; existing rows/queries are unaffected.
- `renderPage` keeps its existing return fields; new `viewports` is additive.
- The report's existing "Visual capture" block is replaced by the richer
  viewer, but degrades to the same behavior when only desktop/mobile keys exist.
- `MOBILE` only affects the overall score when actually measured (Req 6.4),
  using the weight already defined in `src/lib/scoring.ts`.
