import Link from "next/link";
import { notFound } from "next/navigation";
import { RotateCw, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getScoreState, CATEGORY_META, CATEGORY_ORDER } from "@/lib/scoring";
import { SiteHeader } from "@/components/site-header";
import { ScoreRing } from "@/components/score-ring";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { PriorityIssues, type IssueView } from "@/components/audit/priority-issues";
import {
  ScreenshotViewer,
  type ViewerMarker,
} from "@/components/audit/screenshot-viewer";
import {
  AIRecommendations,
  type RecommendationView,
} from "@/components/audit/ai-recommendations";
import { CompetitorComparison } from "@/components/audit/competitor-comparison";
import { listComparisons } from "@/lib/competitor/service";
import { BrandingSettings } from "@/components/audit/branding-settings";
import { getBranding } from "@/lib/report/branding";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    include: {
      scores: true,
      website: true,
      pages: { orderBy: { createdAt: "asc" } },
      issues: true,
      visualMarkers: { orderBy: { index: "asc" } },
      recommendations: { where: { source: "AI" } },
    },
  });
  if (!audit) notFound();

  const scoreByCategory = new Map(audit.scores.map((s) => [s.category, s]));
  const overall = audit.overallScore ?? 0;
  const overallState = getScoreState(overall);

  // Phase 6: the OVERALL score carries a transparent weighting breakdown.
  const overallScoreRow = scoreByCategory.get("OVERALL" as never);
  const overallDetails = (overallScoreRow?.details ?? null) as {
    explanation?: string;
    issueCounts?: {
      CRITICAL: number;
      HIGH: number;
      MEDIUM: number;
      LOW: number;
      total: number;
    };
    skipped?: string[];
    categories?: {
      category: string;
      score: number;
      weight: number;
      weightShare: number;
      contribution: number;
    }[];
  } | null;

  const analyzed = audit.status === "COMPLETED" && audit.scores.length > 0;
  const rootPage = audit.pages[0];
  const auditMeta = (audit.meta ?? {}) as { pageCount?: number };

  // Phase 10: this audit's own score map + persisted competitor comparisons.
  const auditScoreMap = {
    overall,
    categories: Object.fromEntries(
      audit.scores
        .filter((s) => s.category !== "OVERALL")
        .map((s) => [s.category, s.score]),
    ) as Record<string, number>,
  };
  const auditHost = audit.website?.host ?? new URL(audit.url).hostname;
  const comparisons = analyzed ? await listComparisons(id) : [];

  // Phase 11: white-label / agency branding.
  const branding = await getBranding(id);
  const whiteLabel = branding.whiteLabel && Boolean(branding.agencyName);

  // Assemble per-viewport screenshot viewers (desktop + mobile), pulling the
  // storage key from the full screenshots map when present and falling back to
  // the legacy desktopShot/mobileShot fields. Markers are grouped by viewport.
  const screenshotMap = (rootPage?.screenshots ?? {}) as Record<string, string>;
  const markersByViewport = new Map<string, ViewerMarker[]>();
  for (const m of audit.visualMarkers) {
    const list = markersByViewport.get(m.viewport) ?? [];
    list.push({
      index: m.index,
      relX: m.relX,
      relY: m.relY,
      relW: m.relW,
      relH: m.relH,
      label: m.label,
      severity: m.severity,
    });
    markersByViewport.set(m.viewport, list);
  }

  const viewerConfigs = [
    {
      viewport: "desktop",
      label: "Desktop",
      key: screenshotMap.desktop ?? rootPage?.desktopShot ?? null,
    },
    {
      viewport: "mobile",
      label: "Mobile",
      key:
        screenshotMap.mobile ??
        screenshotMap["mobile-sm"] ??
        rootPage?.mobileShot ??
        null,
    },
  ];
  const viewers = viewerConfigs
    .filter((v) => v.key)
    .map((v) => ({
      ...v,
      src: `/api/screenshots/${v.key}`,
      markers:
        markersByViewport.get(v.viewport) ??
        (v.viewport === "mobile"
          ? markersByViewport.get("mobile-sm") ?? []
          : []),
    }));
  const hasScreenshots = viewers.length > 0;

  return (
    <div className="flex min-h-dvh flex-col">
      {whiteLabel ? (
        <header className="w-full border-b border-border/60 bg-background/70">
          <div className="container flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              {branding.agencyLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.agencyLogo}
                  alt={`${branding.agencyName} logo`}
                  className="h-8 w-auto"
                />
              ) : null}
              <span className="font-semibold tracking-tight">
                {branding.agencyName}
              </span>
            </div>
            {branding.agencyWebsite && (
              <a
                href={branding.agencyWebsite}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {branding.agencyWebsite.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        </header>
      ) : (
        <SiteHeader />
      )}
      <main className="container flex-1 py-10">
        {/* Report header */}
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="font-mono text-sm text-muted-foreground">{audit.url}</p>
            <p className="text-xs text-muted-foreground">
              Analyzed {new Date(audit.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {analyzed && (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/audits/${audit.id}/pdf`}>
                  <Download className="size-4" /> Download PDF
                </a>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <RotateCw className="size-4" /> Re-analyze
              </Link>
            </Button>
          </div>
        </div>

        {!analyzed ? (
          <div className="space-y-6">
            <Card className="p-6 text-sm text-muted-foreground">
              The scoring engine, AI recommendations and full dashboard land in
              later phases. Everything shown below is <strong>measured</strong>{" "}
              from a real crawl of this site — no fabricated scores.
            </Card>

            {audit.pages.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Pages crawled</p>
                  <p className="text-2xl font-bold">
                    {auditMeta.pageCount ?? audit.pages.length}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Root HTTP status</p>
                  <p className="text-2xl font-bold">{rootPage?.httpStatus ?? "—"}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Page title</p>
                  <p className="truncate text-sm font-medium" title={rootPage?.title ?? ""}>
                    {rootPage?.title ?? "—"}
                  </p>
                </Card>
              </div>
            )}

            {hasScreenshots && (
              <Card className="p-6">
                <h2 className="mb-4 font-semibold">Mobile &amp; Visual</h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-[2fr_1fr]">
                  {viewers.map((v) => (
                    <ScreenshotViewer
                      key={v.viewport}
                      viewport={v.viewport}
                      label={v.label}
                      src={v.src}
                      markers={v.markers}
                    />
                  ))}
                </div>
              </Card>
            )}
          </div>
        ) : (
          <>
            {/* Executive score */}
            <Card className="mb-8 flex flex-col items-center gap-6 p-8 sm:flex-row sm:items-center">
              <ScoreRing score={overall} size={168} />
              <div className="flex-1 text-center sm:text-left">
                <div className="mb-2 flex items-center justify-center gap-2 sm:justify-start">
                  <Badge variant={overallState.state}>
                    <Icon name={overallState.icon} className="size-3.5" />
                    {overallState.label}
                  </Badge>
                </div>
                <h1 className="text-2xl font-bold">Website Health Score</h1>
                <p className="mt-1 text-muted-foreground">
                  {overall} / 100 — a clear picture of what to fix first.
                </p>
                {overallDetails?.issueCounts && overallDetails.issueCounts.total > 0 && (
                  <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                    {overallDetails.issueCounts.CRITICAL > 0 && (
                      <Badge variant="critical">
                        {overallDetails.issueCounts.CRITICAL} Critical
                      </Badge>
                    )}
                    {overallDetails.issueCounts.HIGH > 0 && (
                      <Badge variant="poor">{overallDetails.issueCounts.HIGH} High</Badge>
                    )}
                    {overallDetails.issueCounts.MEDIUM > 0 && (
                      <Badge variant="warning">
                        {overallDetails.issueCounts.MEDIUM} Medium
                      </Badge>
                    )}
                    {overallDetails.issueCounts.LOW > 0 && (
                      <Badge variant="good">{overallDetails.issueCounts.LOW} Low</Badge>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* How the score is calculated (transparent weighting) */}
            {overallDetails?.categories && overallDetails.categories.length > 0 && (
              <Card className="mb-8 p-6">
                <h2 className="mb-1 font-semibold">How this score is calculated</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  {overallDetails.explanation ??
                    "A weighted average of the categories measured in this audit."}
                </p>
                <ul className="space-y-2">
                  {overallDetails.categories
                    .slice()
                    .sort((a, b) => b.contribution - a.contribution)
                    .map((c) => {
                      const meta = CATEGORY_META[c.category];
                      return (
                        <li key={c.category} className="flex items-center gap-3 text-sm">
                          <span className="flex w-40 items-center gap-2 text-muted-foreground">
                            {meta && <Icon name={meta.icon} className="size-4" />}
                            {meta?.label ?? c.category}
                          </span>
                          <div className="flex-1">
                            <div className="h-2 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${Math.round(c.weightShare * 100)}%` }}
                              />
                            </div>
                          </div>
                          <span className="w-28 text-right tabular-nums text-muted-foreground">
                            {c.score}/100 · {Math.round(c.weightShare * 100)}%
                          </span>
                        </li>
                      );
                    })}
                </ul>
                {overallDetails.skipped && overallDetails.skipped.length > 0 && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Not measured this run (excluded from the score):{" "}
                    {overallDetails.skipped
                      .map((s) => CATEGORY_META[s]?.label ?? s)
                      .join(", ")}
                    .
                  </p>
                )}
              </Card>
            )}

            {/* Category grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {CATEGORY_ORDER.filter((cat) => scoreByCategory.has(cat as never)).map(
                (cat) => {
                  const s = scoreByCategory.get(cat as never)!;
                  const value = s.score;
                  const state = getScoreState(value);
                  const meta = CATEGORY_META[cat];
                  return (
                    <Card key={cat} className="p-4" title={s.summary}>
                      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Icon name={meta.icon} className="size-4" />
                        {meta.label}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums">{value}</span>
                        <Badge variant={state.state} className="text-[10px]">
                          {state.label}
                        </Badge>
                      </div>
                    </Card>
                  );
                },
              )}
            </div>

            {/* Priority issues (measured) */}
            <div className="mt-10">
              <h2 className="mb-4 text-xl font-semibold">Priority issues</h2>
              <PriorityIssues issues={audit.issues as IssueView[]} />
            </div>

            {/* AI recommendations (interpretation of the measured findings) */}
            <AIRecommendations
              items={audit.recommendations as RecommendationView[]}
            />

            {/* Competitor comparison (measured, same engine) */}
            <CompetitorComparison
              auditId={audit.id}
              auditHost={auditHost}
              auditScores={auditScoreMap}
              initialCompetitors={comparisons}
            />

            {/* Custom CTA (white-label) */}
            {whiteLabel && branding.customCta && (
              <Card className="mt-10 flex flex-col items-center gap-3 bg-primary/5 p-8 text-center">
                <p className="text-lg font-semibold">{branding.customCta}</p>
                {branding.agencyContact && (
                  <p className="text-sm text-muted-foreground">
                    {branding.agencyContact}
                  </p>
                )}
                {branding.agencyWebsite && (
                  <Button asChild size="sm">
                    <a
                      href={branding.agencyWebsite}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Get in touch
                    </a>
                  </Button>
                )}
              </Card>
            )}

            {/* Agency & white-label branding settings */}
            <BrandingSettings auditId={audit.id} initial={branding} />

            {/* Mobile & Visual */}
            {hasScreenshots && (
              <Card className="mt-10 p-6">
                <h2 className="mb-1 font-semibold">Mobile &amp; Visual</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  Toggle &ldquo;Show issues&rdquo; to see where measured mobile
                  problems appear on each screenshot.
                </p>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-[2fr_1fr]">
                  {viewers.map((v) => (
                    <ScreenshotViewer
                      key={v.viewport}
                      viewport={v.viewport}
                      label={v.label}
                      src={v.src}
                      markers={v.markers}
                    />
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
