import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAudit } from "@/lib/audit/service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().min(1, "Please enter a website URL.").max(2048),
});

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  // Basic abuse protection: 5 audits / minute / IP.
  const ip = clientIp(req);
  const rl = await rateLimit(`audit:${ip}`, 5, 60);
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

  try {
    const result = await createAudit({ url: parsed.data.url });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ auditId: result.auditId }, { status: 201 });
  } catch (err) {
    // Never return an empty body — always JSON so the client shows a useful message.
    const isDbConfig =
      err instanceof Error && /DATABASE_URL|PrismaClientInitialization/.test(err.message);
    console.error("[api/audits] failed to create audit:", err);
    return NextResponse.json(
      {
        error: isDbConfig
          ? "The service isn't fully configured yet (database unavailable). See setup notes."
          : "We couldn't start the analysis right now. Please try again in a moment.",
      },
      { status: 503 },
    );
  }
}
