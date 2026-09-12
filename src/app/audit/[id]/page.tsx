import { notFound } from "next/navigation";
import { getAuditStatus } from "@/lib/audit/service";
import { SiteHeader } from "@/components/site-header";
import { LiveProgress } from "@/components/audit/live-progress";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const status = await getAuditStatus(id);
  if (!status) notFound();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container flex flex-1 items-center py-16">
        <div className="w-full">
          <LiveProgress
            initial={{
              id: status.id,
              url: status.url,
              status: status.status,
              stage: status.stage,
              progress: status.progress,
              overallScore: status.overallScore,
              errorMessage: status.errorMessage,
            }}
          />
        </div>
      </main>
    </div>
  );
}
