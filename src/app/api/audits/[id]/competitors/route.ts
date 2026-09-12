import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addCompetitor, listComparisons } from "@/lib/competitor/service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().min(1, "Please enter a competitor URL.").max(2048),
});

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const comparisons = await listComparisons(id);
  return NextResponse.json({ comparisons });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Competitor analysis runs a full crawl — rate limit tightly.
  const ip = clientIp(req);
  const rl = await rateLimit(`competitor:${ip}`, 3, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "You're going a little fast. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.resetSeconds) } },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const result = await addCompetitor(id, parsed.data.url);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ comparisonId: result.comparisonId }, { status: 201 });
}
