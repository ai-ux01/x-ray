// AI recommendation generation (Phase 7).
//
// The AI layer INTERPRETS measured findings — it never invents metrics. We feed
// the model only measured evidence (category scores + issues) and ask it to
// prioritize fixes, explain impact in plain language, and (optionally) suggest
// before/after copy. Output is strict JSON, validated with Zod, so malformed
// model responses degrade gracefully instead of corrupting the report.
//
// Internal prompts are NEVER persisted (product principle) — only the parsed
// recommendations and token usage are stored.

import { z } from "zod";
import { getAIProvider, AIUnavailableError } from "@/lib/ai";
import type { AICompletionResult } from "@/lib/ai/types";
import type { CategoryResult } from "@/lib/engine/types";
import type { ScoringSummary } from "@/lib/engine/scoring-engine";
import type { ScoreCategory, Severity, Impact, Effort } from "@prisma/client";

const CATEGORIES = [
  "PERFORMANCE",
  "SEO",
  "ACCESSIBILITY",
  "UX",
  "MOBILE",
  "CONTENT",
  "CONVERSION",
  "TECHNICAL",
  "SECURITY",
  "AI_READINESS",
] as const;

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const IMPACTS = ["HIGH", "MEDIUM", "LOW"] as const;
const EFFORTS = ["HIGH", "MEDIUM", "LOW"] as const;
const ROADMAPS = ["TODAY", "WEEK", "MONTH"] as const;

// Schema the model must return. Lenient enough to tolerate case, strict on shape.
const recommendationSchema = z.object({
  title: z.string().min(1).max(160),
  category: z.enum(CATEGORIES),
  problem: z.string().min(1).max(600),
  evidence: z.string().min(1).max(600),
  recommendation: z.string().min(1).max(800),
  priority: z.enum(SEVERITIES),
  impact: z.enum(IMPACTS),
  effort: z.enum(EFFORTS),
  roadmap: z.enum(ROADMAPS),
  beforeText: z.string().max(600).optional().nullable(),
  afterText: z.string().max(600).optional().nullable(),
  rationale: z.string().max(600).optional().nullable(),
});

const responseSchema = z.object({
  recommendations: z.array(recommendationSchema).max(20),
});

export type AIRecommendation = z.infer<typeof recommendationSchema>;

export interface RecommendationResult {
  recommendations: AIRecommendation[];
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}

const SYSTEM_PROMPT = `You are a senior web consultant reviewing a website audit.
You are given MEASURED findings only. Your job is to INTERPRET them into a
prioritized, actionable plan. Follow these rules strictly:
- Never invent metrics or facts. Only reference the evidence provided.
- Be specific and practical; avoid generic filler.
- Prioritize by real user/business impact vs. effort.
- Use plain language a non-expert site owner can act on.
- For content/copy problems you may propose concise before/after text.
- Respond with STRICT JSON only, matching the requested schema. No prose.`;

/** Compact, evidence-only view of the audit for the model. */
function buildEvidence(results: CategoryResult[], summary: ScoringSummary) {
  return {
    overall: summary.overall,
    categories: results
      .filter((r) => r.category !== "OVERALL")
      .map((r) => ({
        category: r.category,
        score: r.score,
        summary: r.summary,
        issues: r.issues.map((i) => ({
          title: i.title,
          severity: i.severity,
          problem: i.problem,
          whyItMatters: i.whyItMatters,
          recommendation: i.recommendation,
          impact: i.impact,
          effort: i.effort,
        })),
      })),
  };
}

function buildUserPrompt(evidence: unknown): string {
  return `Here are the MEASURED audit findings as JSON:

${JSON.stringify(evidence, null, 2)}

Produce a prioritized set of recommendations (at most 12). Return STRICT JSON:
{
  "recommendations": [
    {
      "title": "short imperative title",
      "category": "one of PERFORMANCE|SEO|ACCESSIBILITY|UX|MOBILE|CONTENT|CONVERSION|TECHNICAL|SECURITY|AI_READINESS",
      "problem": "what is wrong, grounded in the evidence",
      "evidence": "the measured fact this is based on",
      "recommendation": "the concrete fix",
      "priority": "CRITICAL|HIGH|MEDIUM|LOW",
      "impact": "HIGH|MEDIUM|LOW",
      "effort": "HIGH|MEDIUM|LOW",
      "roadmap": "TODAY|WEEK|MONTH",
      "beforeText": "optional current copy",
      "afterText": "optional improved copy",
      "rationale": "optional short why"
    }
  ]
}`;
}

/** Extracts a JSON object from a model response that may include stray text. */
function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall back to the first {...} block.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON.");
  }
}

/**
 * Generates AI recommendations from measured results. Throws
 * AIUnavailableError when no provider is configured or the call fails; the
 * caller treats AI as optional and the audit still completes.
 */
export async function generateRecommendations(
  results: CategoryResult[],
  summary: ScoringSummary,
  opts: { signal?: AbortSignal } = {},
): Promise<RecommendationResult> {
  const provider = getAIProvider();
  if (!provider.isConfigured()) {
    throw new AIUnavailableError();
  }

  const evidence = buildEvidence(results, summary);

  let completion: AICompletionResult;
  try {
    completion = await provider.complete({
      json: true,
      temperature: 0.3,
      maxTokens: 2048,
      signal: opts.signal,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(evidence) },
      ],
    });
  } catch (err) {
    if (err instanceof AIUnavailableError) throw err;
    throw new AIUnavailableError(
      "The AI provider failed to generate recommendations.",
    );
  }

  const parsed = responseSchema.safeParse(parseJsonLoose(completion.text));
  if (!parsed.success) {
    throw new AIUnavailableError(
      "The AI provider returned an unexpected response format.",
    );
  }

  return {
    recommendations: parsed.data.recommendations,
    provider: completion.provider,
    model: completion.model,
    promptTokens: completion.usage?.promptTokens,
    completionTokens: completion.usage?.completionTokens,
  };
}

export type { ScoreCategory, Severity, Impact, Effort };
