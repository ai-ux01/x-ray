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

## Production checklist

- Set `DATABASE_URL` to a managed PostgreSQL instance and run `npm run db:push`
  (or `npm run db:migrate` for migration history).
- Set `REDIS_URL` and run the dedicated worker (`npm run worker`) so audits are
  durable and the web tier never blocks. Without Redis the queue is in-memory
  and single-instance (dev only).
- Set `NEXT_PUBLIC_APP_URL` to the public URL and keep
  `CRAWLER_ALLOW_PRIVATE_IPS=false`.
- Install the browser once on the host: `npx playwright install --with-deps chromium`.
- `npm run build && npm run start`. `validateEnv()` (run by the worker on start)
  reports missing/weak production config.
# x-ray
