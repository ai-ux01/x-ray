import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReportHtml } from "@/lib/report/pdf-html";
import { htmlToPdf } from "@/lib/report/pdf";
import { saveReportFile, readReportFile } from "@/lib/report/storage";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const audit = await prisma.audit.findUnique({
    where: { id },
    select: { id: true, status: true, report: { select: { pdfUrl: true } } },
  });
  if (!audit) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }
  if (audit.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "This audit is not complete yet." },
      { status: 409 },
    );
  }

  const filename = `websitexray-report-${id}.pdf`;
  const regenerate = req.nextUrl.searchParams.get("regenerate") === "1";

  // Serve the cached PDF unless a regenerate was requested.
  if (!regenerate && audit.report?.pdfUrl) {
    const cached = await readReportFile(audit.report.pdfUrl);
    if (cached) return pdfResponse(cached, filename);
  }

  const html = await buildReportHtml(id);
  if (!html) {
    return NextResponse.json(
      { error: "Report data is unavailable." },
      { status: 404 },
    );
  }

  let pdf: Buffer;
  try {
    pdf = await htmlToPdf(html);
  } catch (err) {
    console.error("[api/audits/pdf] generation failed:", err);
    return NextResponse.json(
      { error: "We couldn't generate the PDF right now. Please try again." },
      { status: 503 },
    );
  }

  const key = await saveReportFile(filename, pdf);
  await prisma.report.upsert({
    where: { auditId: id },
    create: { auditId: id, pdfUrl: key },
    update: { pdfUrl: key },
  });

  return pdfResponse(pdf, filename);
}

function pdfResponse(data: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
