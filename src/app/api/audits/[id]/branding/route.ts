import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBranding, updateBranding } from "@/lib/report/branding";

export const runtime = "nodejs";

// Optional http(s) URL string (empty/blank allowed → treated as unset).
const optionalUrl = z
  .string()
  .max(2048)
  .optional()
  .nullable()
  .refine(
    (v) => !v || /^https?:\/\//i.test(v.trim()),
    "Must be an http(s) URL.",
  );

const bodySchema = z.object({
  whiteLabel: z.boolean().optional(),
  agencyName: z.string().max(120).optional().nullable(),
  agencyLogo: optionalUrl,
  agencyWebsite: optionalUrl,
  agencyContact: z.string().max(200).optional().nullable(),
  customCta: z.string().max(400).optional().nullable(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const branding = await getBranding(id);
  return NextResponse.json({ branding });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const audit = await prisma.audit.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!audit) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
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

  const branding = await updateBranding(id, parsed.data);
  return NextResponse.json({ branding });
}
