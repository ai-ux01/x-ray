import { NextRequest, NextResponse } from "next/server";
import { getAuditStatus } from "@/lib/audit/service";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const status = await getAuditStatus(id);
  if (!status) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }
  return NextResponse.json(status);
}
