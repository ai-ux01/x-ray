# WebsiteX-Ray

AI-powered website analysis and auditing platform. Enter a URL and get a
premium report covering performance, SEO, accessibility, UX, mobile, content,
conversion, technical health, security basics and AI readiness.

Think Lighthouse + PageSpeed + Semrush + an AI consultant — with a simpler,
more premium experience.

## Tech stack

- **Next.js 15** (App Router) + **TypeScript** + **React 19**
- **Tailwind CSS** + shadcn-style UI components
- **PostgreSQL** + **Prisma ORM**
- **Redis** (optional) for the job queue + rate limiting
- **Playwright** (browser rendering), **Cheerio** (HTML parsing),
  **Lighthouse** (performance), **axe-core** (accessibility) — wired in later phases
- **AI provider abstraction**: Ollama (local) or any OpenAI-compatible API

## Core product principles

- Never fabricate metrics. Measured data and AI opinion are clearly separated
  (`FindingSource = MEASURED | AI`).
- Every score has an explanation.
- Evidence is shown behind every recommendation.
- The system works for core technical metrics **without** AI. AI only interprets.
- Security review is passive only — never called a penetration test.
- Sample/demo data is always clearly labelled (see `/sample-report`).

## Architecture

```
Browser ──► /api/audits (validate + SSRF guard + rate limit)
                    │
                    ▼
              createAudit()  ─► Website + Audit (QUEUED)
                    │
                    ▼
                Job Queue  (Redis or in-process)
                    │
                    ▼
            runAuditPipeline()   ── async, non-blocking
    Crawl → Browser → Perf → SEO → A11y → UX → Content →
    Conversion → AI → Scoring → Report → DONE
                    │
                    ▼
   Live progress UI polls /api/audits/:id and shows real stages
```

### AI provider abstraction

The engine depends only on the `AIProvider` interface (`src/lib/ai/types.ts`).
Concrete providers live in `src/lib/ai/providers/`. Switch providers by setting
`AI_PROVIDER` in `.env` — no engine changes required. API keys are read from the
environment only and are never hard-coded.

### Security (SSRF protection)

`src/lib/security/url-guard.ts` validates URL syntax and blocks localhost,
private/link-local/CGNAT ranges, cloud metadata IPs, and embedded credentials.
`assertPublicHost()` re-resolves DNS before each outbound request to defend
against DNS rebinding. Crawler limits (max pages/depth, timeouts, response size)
are enforced via env config.

## Getting started

### Option A — Zero-install local dev (SQLite)

For getting started without installing PostgreSQL:

```bash
npm install
cp .env.example .env          # keep DATABASE_URL="file:./dev.db"
npm run db:dev:push           # generates a SQLite dev schema + creates dev.db
npm run dev
```

`db:dev:push` derives a SQLite schema from the canonical Postgres schema
(`scripts/gen-sqlite-schema.mjs`) so the production schema stays the single
source of truth. Prisma 6 supports the enums and JSON fields on SQLite.

### Option B — Production-like (PostgreSQL)

```bash
npm install
cp .env.example .env          # set DATABASE_URL to your PostgreSQL instance
npm run db:push               # or: npm run db:migrate
npm run build && npm run start
```

`npm run build` runs `prisma generate` against the PostgreSQL schema.

### Background processing

Without `REDIS_URL`, audits are processed in-process (dev convenience). With
Redis set, run the dedicated worker:

```bash
npm run worker
```

> Note: the analysis engine uses Playwright (Chromium) and Lighthouse, which
> launch headless Chrome. Run `npx playwright install chromium` once.

## Roadmap (phased)

1. ✅ Landing page + URL input + audit creation
2. ✅ Crawler + Playwright
3. ✅ SEO + technical analysis
4. ✅ Lighthouse + accessibility
5. ✅ Mobile + screenshot analysis
6. ✅ Scoring engine
7. ✅ AI recommendations
8. ✅ Dashboard
9. ✅ PDF reports
10. ✅ Competitor analysis
11. ✅ Agency / white-label mode
12. ⏸️ Billing (deferred — needs a payment provider + auth)

## Deployment

The audit engine launches headless Chromium (Playwright) and runs Lighthouse,
so it needs a **container / persistent-process host** — not serverless (Vercel
functions can't run the browser or the long crawl). Render, Fly, Railway, or a
VM all work. A `Dockerfile` and `render.yaml` blueprint are included.

### Render (recommended)

1. Push the repo and create a Blueprint from `render.yaml`. It provisions a
   PostgreSQL database and a Dockerized web service with a persistent disk.
2. The disk is mounted at `/app/.data` and `ARTIFACT_DIR` points screenshot +
   PDF storage there, so artifacts persist and are served by the same instance.
3. After the first deploy, set `NEXT_PUBLIC_APP_URL` to the service URL.
4. Run the schema once against the managed database: `npm run db:push`
   (or `npm run db:migrate` for migration history).

This single-service topology runs audits **in-process** (no Redis needed):
screenshots are written and served by the same instance. For horizontal scale,
split into web + worker services backed by `REDIS_URL` and move artifacts to
object storage (the storage modules are isolated for this).

### Configuration checklist

- `DATABASE_URL` — managed PostgreSQL (wired automatically by the blueprint).
- `NEXT_PUBLIC_APP_URL` — the public URL.
- `ARTIFACT_DIR` — a persistent path for screenshots/PDFs (the disk mount).
- `CRAWLER_ALLOW_PRIVATE_IPS=false` — keep SSRF protection on.
- AI is optional: leave `AI_PROVIDER=disabled`, or set `AI_PROVIDER=openai` +
  `OPENAI_API_KEY` (as a dashboard secret), or `AI_PROVIDER=ollama` with a
  reachable Ollama host. AI failures never break an audit.

### Building the image

The `Dockerfile` uses the official Playwright base image (Chromium + system
deps preinstalled, matching the Playwright version in `package.json`), runs
`npm run build`, and starts `next start`.
# x-ray
