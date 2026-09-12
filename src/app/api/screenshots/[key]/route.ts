import { NextRequest, NextResponse } from "next/server";
import { readScreenshot } from "@/lib/crawler/screenshots";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const data = await readScreenshot(key);
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
