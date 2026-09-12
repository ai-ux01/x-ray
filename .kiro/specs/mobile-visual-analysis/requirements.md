# Requirements Document

## Introduction

Phase 5 adds two capabilities to WebsiteX-Ray's audit engine and report:

1. **Mobile Experience analysis** — render the target site at multiple mobile
   and tablet viewports and produce a measured Mobile category score (0–100)
   with specific, evidence-backed issues (overflow, tiny fonts, small touch
   targets, horizontal scrolling, missing mobile CTA, etc.).
2. **Visual analysis** — capture per-viewport screenshots and let the user
   toggle a "Show Issues" overlay that places numbered markers on the
   screenshot, each linked to a plain-language explanation.

This phase extends the existing crawler (Playwright), analyzer registry, scoring
engine, and report dashboard. It must honor the product's core principles:
never fabricate metrics, clearly separate measured data from AI opinion, and
degrade gracefully when a measurement cannot be taken.

Alignment with the existing architecture:

- New work plugs into the `Analyzer` interface and analyzer registry.
- Multi-viewport rendering extends `src/lib/crawler/renderer.ts`.
- Screenshots continue to use the existing key-based storage + `/api/screenshots`.
- The Mobile score is persisted like any other `AuditScore`; visual markers are
  persisted as measured issues with viewport + coordinate evidence.

## Glossary

- **Viewport**: A specific rendering width/height + device profile (e.g. 390px
  mobile with touch enabled).
- **Tap target**: The clickable area of an interactive element (link/button).
- **Overflow**: When a page's scroll width exceeds its layout viewport width,
  causing horizontal scrolling on mobile.
- **Above-the-fold**: The region of the page visible without scrolling at a
  given viewport height.
- **Visual marker**: A numbered annotation positioned on a screenshot by
  relative coordinates, linked to a short explanation.
- **MEASURED / AI**: Provenance of a finding. MEASURED comes from DOM/render
  facts; AI comes from model interpretation (visually distinguished in the UI).

## Requirements

### Requirement 1: Multi-viewport rendering

**User Story:** As a site owner, I want my site rendered at real mobile, tablet,
and desktop widths, so that the mobile assessment reflects how actual devices
display my site.

#### Acceptance Criteria

1. WHEN the crawler renders the root page THEN the system SHALL capture the DOM
   state and a screenshot at each of these viewports: 375px (small mobile),
   390px (mobile), 768px (tablet), and a desktop width (≥1280px).
2. WHEN a viewport is rendered THEN the system SHALL use a mobile device profile
   (touch enabled, isMobile true, appropriate device scale factor) for the
   375px and 390px viewports.
3. IF capturing a screenshot at a given viewport fails THEN the system SHALL
   continue with the remaining viewports and record that viewport's screenshot
   as unavailable, without failing the audit.
4. WHEN rendering completes THEN the system SHALL make per-viewport measurements
   (scroll width, layout width, computed font sizes, tap-target sizes) available
   to the Mobile analyzer.
5. WHEN rendering multiple viewports THEN the system SHALL keep total render
   time bounded by the existing crawler timeout configuration AND SHALL reuse a
   single browser context/page where safe rather than launching extra browsers.

### Requirement 2: Mobile Experience analyzer and score

**User Story:** As a site owner, I want a Mobile score with specific problems,
so that I know exactly what to fix for mobile visitors.

#### Acceptance Criteria

1. WHEN the Mobile analyzer runs THEN the system SHALL produce a category result
   for MOBILE with a 0–100 score and a plain-language summary explanation.
2. WHEN the page content is wider than the viewport at a mobile width THEN the
   system SHALL raise a horizontal-scrolling/content-overflow issue with
   evidence (viewport width, scroll width, overflow in px).
3. WHEN body/base font size at mobile width is below a legibility threshold
   (< 12px effective) THEN the system SHALL raise a text-too-small issue with
   the measured size.
4. WHEN interactive elements have tap targets smaller than the recommended
   minimum (< 40x40px effective) beyond a small tolerance count THEN the system
   SHALL raise a touch-targets-too-small issue with a count and examples.
5. WHEN the page lacks a responsive viewport meta tag THEN the system SHALL
   raise a missing/incorrect viewport-meta issue AND SHALL coordinate with the
   Technical analyzer to avoid double-counting the same defect in the score.
6. WHEN a primary CTA is present on desktop but not visible within the mobile
   above-the-fold region THEN the system SHALL raise a mobile-CTA-not-visible
   issue. IF CTA detection is inconclusive THEN the system SHALL NOT raise a
   false positive.
7. WHEN any mobile defect is detected THEN the score SHALL be reduced
   proportionally to its severity AND every deduction SHALL be traceable,
   consistent with the existing deduction-based scoring.
8. IF multi-viewport measurement is unavailable THEN the Mobile analyzer SHALL
   be skipped rather than persisted as a fabricated 0, matching the
   Performance/Accessibility degradation behavior already in the pipeline.

### Requirement 3: Per-viewport screenshots in the report

**User Story:** As a user, I want to see how my site looks on mobile and
desktop, so that I can visually verify the findings.

#### Acceptance Criteria

1. WHEN an audit has captured screenshots THEN the report SHALL display the
   available viewport screenshots (at minimum mobile and desktop) with clear
   labels and accessible alt text.
2. WHEN a screenshot for a viewport is unavailable THEN the report SHALL omit
   that image gracefully without broken-image placeholders.
3. WHEN a screenshot is displayed THEN it SHALL be served through the existing
   /api/screenshots/[key] route and referenced by key, never embedded as a raw
   blob in the database.

### Requirement 4: "Show Issues" visual overlay

**User Story:** As a user, I want to toggle numbered markers over the screenshot,
so that I can see where each visual problem is located.

#### Acceptance Criteria

1. WHEN the report shows a screenshot that has associated visual markers THEN
   the system SHALL render a "Show Issues" toggle control.
2. WHEN the user activates "Show Issues" THEN the system SHALL overlay numbered
   markers positioned by relative coordinates on the screenshot.
3. WHEN the user focuses or hovers a marker THEN the system SHALL reveal that
   marker's short explanation (e.g. "CTA lacks visual prominence").
4. WHEN markers are shown THEN the overlay SHALL be keyboard accessible: markers
   SHALL be focusable, their explanations reachable without a mouse, and marker
   numbers SHALL be conveyed as text (not color alone).
5. WHEN there are no visual markers for a screenshot THEN the toggle SHALL be
   hidden or disabled AND no empty overlay SHALL be shown.
6. WHEN markers are positioned THEN their coordinates SHALL be stored as
   relative fractions (0–1 of width/height) so they render correctly regardless
   of displayed image size.

### Requirement 5: Data model and persistence

**User Story:** As a maintainer, I want visual markers persisted with clear
provenance, so that the report is reproducible and honest about data source.

#### Acceptance Criteria

1. WHEN the analysis produces markers THEN each marker SHALL be persisted with:
   viewport label, relative x/y (and optional width/height), a short label, a
   category, a severity, and a source of MEASURED.
2. WHEN a marker is derived from measured DOM facts THEN it SHALL be marked
   MEASURED; WHEN future AI-generated visual commentary is added it SHALL be
   marked AI and visually distinguished. The data model SHALL support both.
3. WHEN the report loads markers THEN it SHALL group them by viewport so the
   correct markers overlay the correct screenshot.

### Requirement 6: Non-regression and safety

**User Story:** As a maintainer, I want Phase 5 to not break existing behavior
or safety guarantees.

#### Acceptance Criteria

1. WHEN Phase 5 code runs THEN all existing SSRF protections SHALL remain in
   effect for every viewport render, with no new unguarded navigations.
2. WHEN the Mobile analyzer or multi-viewport rendering throws THEN the audit
   SHALL still complete for the other categories (single-analyzer failure is
   isolated, matching current pipeline behavior).
3. WHEN the project is built and tested THEN existing builds, type checks, and
   the URL-guard test suite SHALL continue to pass AND new pure logic (overflow,
   tap-target, and score calculations) SHALL have unit tests.
4. WHEN the overall score is computed THEN it SHALL incorporate the Mobile
   category using the existing transparent weighting only when Mobile was
   actually measured.
