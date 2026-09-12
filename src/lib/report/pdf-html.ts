// Builds a self-contained, print-optimized HTML document for the PDF export.
//
// The HTML is fully standalone: no external CSS/JS and screenshots are inlined
// as base64 data URIs, so Chromium can render it without loading the app or
// hitting the network. Content mirrors the web report (measured scores +
// issues + AI recommendations) and honors the product principles: every score
// has an explanation and AI content is clearly labeled as interpretation.

import { prisma } from "@/lib/prisma";
import { readScreenshot } from "@/lib/crawler/screenshots";
import { getScoreState, CATEGORY_META, CATEGORY_ORDER } from "@/lib/scoring";
import { getBranding } from "@/lib/report/branding";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATE_COLORS: Record<string, string> = {
  excellent: "#16a34a",
  good: "#65a30d",
  warning: "#d97706",
  poor: "#ea580c",
  critical: "#dc2626",
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#d97706",
  LOW: "#65a30d",
};

async function inlineScreenshot(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  const buf = await readScreenshot(key);
  if (!buf) return null;
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

/**
 * Returns the standalone HTML for the audit's PDF, or null if the audit doesn't
 * exist / isn't complete enough to render.
 */
export async function buildReportHtml(auditId: string): Promise<string | null> {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      scores: true,
      pages: { orderBy: { createdAt: "asc" }, take: 1 },
      issues: true,
      recommendations: { where: { source: "AI" } },
    },
  });
  if (!audit) return null;

  const scoreByCategory = new Map(audit.scores.map((s) => [s.category, s]));
  const overall = audit.overallScore ?? 0;
  const overallState = getScoreState(overall);
  const rootPage = audit.pages[0];

  const desktopSrc = await inlineScreenshot(rootPage?.desktopShot);
  const mobileSrc = await inlineScreenshot(rootPage?.mobileShot);

  const branding = await getBranding(auditId);
  const whiteLabel = branding.whiteLabel && Boolean(branding.agencyName);
  const brandName = whiteLabel ? branding.agencyName! : "WebsiteX-Ray";

  const generatedAt = new Date().toLocaleString();

  const categoryCards = CATEGORY_ORDER.filter((c) => scoreByCategory.has(c as never))
    .map((cat) => {
      const s = scoreByCategory.get(cat as never)!;
      const state = getScoreState(s.score);
      const meta = CATEGORY_META[cat];
      return `
        <div class="cat">
          <div class="cat-name">${esc(meta?.label ?? cat)}</div>
          <div class="cat-score" style="color:${STATE_COLORS[state.state]}">${s.score}<span>/100</span></div>
          <div class="cat-state">${esc(state.label)}</div>
        </div>`;
    })
    .join("");

  const sortedIssues = [...audit.issues].sort((a, b) => {
    const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
  });

  const issuesHtml = sortedIssues.length
    ? sortedIssues
        .map(
          (i) => `
        <div class="issue">
          <div class="issue-head">
            <span class="pill" style="background:${SEVERITY_COLORS[i.severity]}">${esc(i.severity)}</span>
            <span class="pill pill-outline">${esc(CATEGORY_META[i.category]?.label ?? i.category)}</span>
            <span class="pill pill-outline">Measured</span>
            <span class="meta">Impact ${esc(i.impact)} · Effort ${esc(i.effort)}</span>
          </div>
          <div class="issue-title">${esc(i.title)}</div>
          <div class="issue-grid">
            <div><div class="lbl">Problem</div><div>${esc(i.problem)}</div></div>
            <div><div class="lbl">Why it matters</div><div>${esc(i.whyItMatters)}</div></div>
            <div><div class="lbl">Recommendation</div><div>${esc(i.recommendation)}</div></div>
          </div>
        </div>`,
        )
        .join("")
    : `<p class="muted">No priority issues detected in the measured checks.</p>`;

  const recsHtml = audit.recommendations.length
    ? audit.recommendations
        .map(
          (r) => `
        <div class="issue rec">
          <div class="issue-head">
            <span class="pill" style="background:${SEVERITY_COLORS[r.priority]}">${esc(r.priority)}</span>
            <span class="pill pill-outline">${esc(CATEGORY_META[r.category]?.label ?? r.category)}</span>
            ${r.roadmap ? `<span class="pill pill-ai">${esc(r.roadmap)}</span>` : ""}
            <span class="meta">Impact ${esc(r.impact)} · Effort ${esc(r.effort)}</span>
          </div>
          <div class="issue-title">${esc(r.title)}</div>
          <div class="issue-grid">
            <div><div class="lbl">Problem</div><div>${esc(r.problem)}</div></div>
            <div><div class="lbl">Evidence</div><div>${esc(r.evidence)}</div></div>
            <div><div class="lbl">Recommendation</div><div>${esc(r.recommendation)}</div></div>
          </div>
          ${
            r.beforeText || r.afterText
              ? `<div class="beforeafter">
                   ${r.beforeText ? `<div class="ba before"><div class="lbl">Before</div><div>${esc(r.beforeText)}</div></div>` : ""}
                   ${r.afterText ? `<div class="ba after"><div class="lbl">After</div><div>${esc(r.afterText)}</div></div>` : ""}
                 </div>`
              : ""
          }
        </div>`,
        )
        .join("")
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>WebsiteX-Ray Report — ${esc(audit.url)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; }
  .page { padding: 40px 44px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 28px 0 12px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }
  .muted { color: #6b7280; }
  .url { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #6b7280; }
  header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .brand { font-weight: 700; font-size: 14px; }
  .brand span { color: #4f46e5; }
  .exec { display: flex; align-items: center; gap: 24px; border: 1px solid #e5e5e5; border-radius: 12px; padding: 20px; }
  .ring { width: 96px; height: 96px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; }
  .ring b { font-size: 30px; line-height: 1; }
  .ring span { font-size: 10px; opacity: .9; }
  .exec-label { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .explain { font-size: 12px; color: #4b5563; margin-top: 6px; max-width: 520px; }
  .cats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 16px; }
  .cat { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px; }
  .cat-name { font-size: 11px; color: #6b7280; }
  .cat-score { font-size: 20px; font-weight: 700; }
  .cat-score span { font-size: 11px; color: #9ca3af; font-weight: 400; }
  .cat-state { font-size: 10px; color: #6b7280; }
  .shots { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
  .shots img { width: 100%; border: 1px solid #e5e5e5; border-radius: 8px; }
  .issue { border: 1px solid #e5e5e5; border-radius: 10px; padding: 14px; margin-bottom: 10px; page-break-inside: avoid; }
  .rec { border-left: 4px solid #4f46e5; }
  .issue-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pill { color: #fff; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
  .pill-outline { background: #fff; color: #374151; border: 1px solid #d1d5db; }
  .pill-ai { background: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; }
  .meta { margin-left: auto; font-size: 10px; color: #6b7280; }
  .issue-title { font-weight: 600; margin: 8px 0; font-size: 13px; }
  .issue-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 11px; }
  .lbl { font-size: 10px; color: #6b7280; margin-bottom: 2px; }
  .beforeafter { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; font-size: 11px; }
  .ba { padding: 8px; border-radius: 6px; }
  .before { background: #fef2f2; } .after { background: #f0fdf4; }
  .ai-note { font-size: 11px; color: #6b7280; margin-bottom: 8px; }
  footer { margin-top: 28px; border-top: 1px solid #e5e5e5; padding-top: 10px; font-size: 10px; color: #9ca3af; }
</style>
</head>
<body>
  <div class="page">
    <header>
      <div>
        <h1>Website Health Report</h1>
        <div class="url">${esc(audit.url)}</div>
      </div>
      <div class="brand">${
        whiteLabel
          ? `${
              branding.agencyLogo
                ? `<img src="${esc(branding.agencyLogo)}" alt="${esc(brandName)}" style="height:24px;vertical-align:middle;margin-right:6px;" />`
                : ""
            }${esc(brandName)}`
          : `WebsiteX<span>-Ray</span>`
      }</div>
    </header>

    <div class="exec">
      <div class="ring" style="background:${STATE_COLORS[overallState.state]}">
        <b>${overall}</b><span>/ 100</span>
      </div>
      <div>
        <div class="exec-label" style="color:${STATE_COLORS[overallState.state]}">${esc(overallState.label)}</div>
        <div style="font-size:16px;font-weight:700;">Overall score</div>
        <div class="explain">${esc(scoreByCategory.get("OVERALL" as never)?.summary ?? "")}</div>
      </div>
    </div>

    <div class="cats">${categoryCards}</div>

    ${
      desktopSrc
        ? `<h2>Visual capture</h2>
           <div class="shots">
             <img src="${desktopSrc}" alt="Desktop screenshot" />
             ${mobileSrc ? `<img src="${mobileSrc}" alt="Mobile screenshot" />` : ""}
           </div>`
        : ""
    }

    <h2>Priority issues (measured)</h2>
    ${issuesHtml}

    ${
      recsHtml
        ? `<h2>AI recommendations</h2>
           <p class="ai-note">Generated by AI from the measured findings. Interpretation, not measured data — verify against the evidence.</p>
           ${recsHtml}`
        : ""
    }

    ${
      whiteLabel && branding.customCta
        ? `<div style="margin-top:24px;padding:16px;border-radius:10px;background:#eef2ff;text-align:center;">
             <div style="font-weight:700;font-size:14px;">${esc(branding.customCta)}</div>
             ${branding.agencyContact ? `<div style="font-size:12px;color:#4b5563;margin-top:4px;">${esc(branding.agencyContact)}</div>` : ""}
             ${branding.agencyWebsite ? `<div style="font-size:12px;color:#4f46e5;margin-top:2px;">${esc(branding.agencyWebsite)}</div>` : ""}
           </div>`
        : ""
    }

    <footer>
      Generated by ${esc(brandName)} on ${esc(generatedAt)}. Measured data and AI interpretation are clearly separated. Security review is passive only — not a penetration test.
    </footer>
  </div>
</body>
</html>`;
}
