# Implementation Plan

## Overview

This plan delivers Phase 5 (Mobile Experience + Visual Analysis) incrementally.
It layers from the bottom up: shared types and viewport profiles first, then the
measurement/render layer, then persistence, then the pure scoring logic and
analyzer (test-driven), then UI, and finally end-to-end verification. Each task
is a discrete, reviewable coding step that builds on prior tasks and leaves the
project in a buildable, test-passing state.

## Tasks

- [x] 1. Define viewport profiles and shared engine types
  - Create `src/lib/crawler/viewports.ts` with `ViewportProfile` and
    `VIEWPORT_PROFILES` (375 mobile-sm, 390 mobile, 768 tablet, 1440 desktop),
    including `isMobile` and `deviceScaleFactor`.
  - Add `ViewportMetrics`, `MarkerCandidate`, `ViewportMeasurement`, and
    `VisualMarker` interfaces to `src/lib/engine/types.ts`; extend
    `AnalysisContext` with optional `viewports` and `CrawledPage` with optional
    `screenshots` map. Keep all additions backward-compatible.
  - _Requirements: 1.1, 1.2, 5.1, 5.2_

- [x] 2. Implement the in-page measurement script (pure DOM reads)
  - Add a `measureViewport()` function string/module evaluated via
    `page.evaluate` that returns `ViewportMetrics`: layout width, scrollWidth,
    overflowPx, base font size, count of small text nodes (< 12px), tap-target
    totals and too-small count with examples, CTA above-the-fold flag, and
    capped `markerCandidates` with relative (0–1) coordinates.
  - Ensure coordinates are divided by the rendered document dimensions so they
    are resolution-independent; cap candidates at 8.
  - _Requirements: 1.4, 2.2, 2.3, 2.4, 2.6, 4.6_

- [x] 3. Extend the renderer for multi-viewport capture
  - Generalize `renderPage` to resize the single loaded page across
    `VIEWPORT_PROFILES`, calling `measureViewport()` then screenshotting at each,
    wrapped in per-viewport try/catch so one failure doesn't abort others.
  - Add `viewports: ViewportCapture[]` to `RenderResult`; keep existing
    `desktopScreenshot`/`mobileScreenshot` populated (map from desktop + 390px)
    for backward compatibility. Preserve SSRF guard (no new navigations).
  - _Requirements: 1.1, 1.3, 1.5, 6.1_

- [x] 4. Wire viewport data + screenshots through the crawler
  - In `src/lib/crawler/index.ts`, save each available viewport screenshot by
    key (`${auditId}-${viewportKey}.jpg`), populate the root `CrawledPage.screenshots`
    map, and attach `ctx.viewports` from the root render's measurements.
  - Omit unavailable viewports gracefully.
  - _Requirements: 1.3, 3.1, 3.2, 3.3_

- [x] 5. Add the AuditVisualMarker model and screenshots column (migration)
  - Add `AuditVisualMarker` to `prisma/schema.prisma` with relations to `Audit`
    and `AuditPage`, relative coords, `index`, `label`, `category`, `severity`,
    `source` (default MEASURED). Add `screenshots Json?` to `AuditPage` and
    back-relations. Regenerate the SQLite dev schema and push.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. Implement pure mobile-scoring helpers with unit tests
  - Create `src/lib/engine/analyzers/mobile-scoring.ts` with pure functions:
    `overflowDeduction`, `fontDeduction`, `tapTargetDeduction`,
    `computeMobileScore`, and a marker normalizer (clamp to [0,1], cap, 1-based
    index).
  - Add `mobile-scoring.test.ts` covering Correctness Properties 1–5 and 7
    (bounds, monotonicity, traceable deductions, threshold boundaries at exactly
    12px and 40px, no-overflow case, marker normalization/cap).
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 4.2, 4.6_

- [x] 7. Implement the mobile analyzer
  - Create `src/lib/engine/analyzers/mobile.ts` (category `MOBILE`) that reads
    `ctx.viewports`, emits measured issues (overflow, small text, tap targets,
    viewport-meta with small deduction to avoid double-count, mobile CTA only
    when confident), builds `VisualMarker[]` for the mobile viewport, computes
    the score via the pure helpers, and returns them on `CategoryResult.details`.
  - If `ctx.viewports` is missing/empty, return `details.available = false`
    (skip path). Add an analyzer-level test for the skip path (Property 8) and
    the CTA no-false-positive path (Property 6).
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 6.4_

- [x] 8. Register the analyzer and persist markers
  - Register `mobileAnalyzer` in `src/lib/engine/registry.ts` with a MOBILE
    stage checkpoint.
  - In `src/lib/engine/persist.ts`, read `CategoryResult.details.markers` and
    write `AuditVisualMarker` rows (grouped by viewport); ensure the existing
    skip-unavailable filter still excludes MOBILE when not measured.
  - _Requirements: 2.8, 5.1, 5.3, 6.2, 6.4_

- [x] 9. Build the ScreenshotViewer and IssueOverlay UI components
  - Create `src/components/audit/screenshot-viewer.tsx` (client) rendering an
    image with a positioned overlay container and a "Show Issues" toggle that is
    hidden/disabled when there are no markers.
  - Create the numbered `IssueOverlay` with focusable `<button>` markers,
    `aria-label="Issue N: <label>"`, tooltip/popover on focus/hover, numbers as
    text, positioned by relative coordinates × rendered box size.
  - _Requirements: 3.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 10. Integrate viewers and markers into the report page
  - Update `src/app/audit/[id]/report/page.tsx` to query `visualMarkers` and
    read `AuditPage.screenshots`; render a "Mobile & Visual" section with desktop
    and mobile viewers side by side, markers grouped by viewport, omitting
    unavailable screenshots. Replace the existing single "Visual capture" block.
  - _Requirements: 3.1, 3.2, 4.1, 5.3_

- [ ] 11. Verify non-regression and end-to-end behavior
  - Run `npm test`, `npm run typecheck`, and `npm run build`; confirm existing
    url-guard tests and new mobile tests pass.
  - Manually run an audit against a responsive site (high mobile score, few
    markers) and a non-responsive/overflowing page (overflow + tap-target
    markers, lower score) to confirm the analyzer differentiates on real data
    and the overlay toggles/keyboard-navigates correctly.
  - _Requirements: 2.1, 6.1, 6.2, 6.3, 6.4_

## Task Dependency Graph

```
1  (types + viewport profiles)
├─► 2  (measurement script)
│   └─► 3  (renderer multi-viewport)
│       └─► 4  (crawler wiring)
├─► 5  (prisma model + migration)
├─► 6  (pure scoring helpers + tests)
│   └─► 7  (mobile analyzer)   ◄── also needs 4 (ctx.viewports)
│       └─► 8  (register + persist markers)   ◄── also needs 5
└─► 9  (UI: ScreenshotViewer + IssueOverlay)

8 ─┐
9 ─┴─► 10 (report integration)   ◄── needs 4 (screenshots), 5 (markers)
                └─► 11 (verification: build, tests, e2e)
```

Dependencies:
- 2 → 1; 3 → 2; 4 → 3
- 6 → 1; 7 → 6, 4; 8 → 7, 5
- 9 → 1; 10 → 8, 9, 4, 5; 11 → 10

```json
{
  "tasks": {
    "1": { "dependencies": [] },
    "2": { "dependencies": ["1"] },
    "3": { "dependencies": ["2"] },
    "4": { "dependencies": ["3"] },
    "5": { "dependencies": ["1"] },
    "6": { "dependencies": ["1"] },
    "7": { "dependencies": ["6", "4"] },
    "8": { "dependencies": ["7", "5"] },
    "9": { "dependencies": ["1"] },
    "10": { "dependencies": ["8", "9", "4", "5"] },
    "11": { "dependencies": ["10"] }
  },
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "5", "6", "9"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["7"] },
    { "wave": 6, "tasks": ["8"] },
    { "wave": 7, "tasks": ["10"] },
    { "wave": 8, "tasks": ["11"] }
  ]
}
```

## Notes

- Follow existing conventions: measured-only findings, `scoreFromDeductions`
  for traceable scoring, skip-not-fabricate on unavailable measurement, single
  shared browser, SSRF re-validation on navigation.
- Schema changes are additive; run `npm run db:dev:push` for local SQLite and
  keep `prisma/schema.prisma` as the production source of truth.
- Tasks 6 and 7 are test-driven — write the property/unit tests alongside the
  pure helpers before wiring the analyzer into the pipeline.
- Do not generate AI-sourced markers in this phase; the model supports the
  MEASURED/AI distinction but only MEASURED markers are produced now.
- After each task, ensure `npm run typecheck` stays green; after tasks 6–8 run
  `npm test`; task 11 runs the full build + manual differentiation check.
