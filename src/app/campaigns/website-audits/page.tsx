import { WebsiteAuditCandidateStatus, WebsiteAuditRunStatus } from "@prisma/client";
import { Globe2, Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { websiteAuditRunStatusLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function WebsiteAuditRunsPage() {
  const [runs, total, running, reviewReady, converted] = await Promise.all([
    prisma.websiteAuditRun.findMany({
      include: {
        selectedOffer: true,
        campaign: true,
        _count: { select: { candidates: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.websiteAuditRun.count(),
    prisma.websiteAuditRun.count({
      where: { status: { in: [WebsiteAuditRunStatus.QUEUED, WebsiteAuditRunStatus.RUNNING] } }
    }),
    prisma.websiteAuditRun.count({ where: { status: WebsiteAuditRunStatus.REVIEW_READY } }),
    prisma.websiteAuditRun.count({ where: { status: WebsiteAuditRunStatus.CONVERTED } })
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Campaigns"
        title="Website Audit Campaigns"
        description="Add business websites, let AI find useful improvement ideas, approve the leads, and create an email campaign."
        actions={
          <Link className="button" href="/campaigns/website-audits/new">
            <Plus size={16} aria-hidden="true" /> Create Website Audit
          </Link>
        }
      />

      <section className="grid grid-4" aria-label="Website audit metrics">
        <Metric label="Audit runs" value={total} note="Website lists checked" />
        <Metric label="Checking now" value={running} note="Queued or running" />
        <Metric label="Ready to review" value={reviewReady} note="Approve good leads" />
        <Metric label="Campaigns created" value={converted} note="Sent to email builder" />
      </section>

      <section className="table-wrap" aria-label="Website audit runs" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Audit</th>
              <th>Service</th>
              <th>Status</th>
              <th>Websites</th>
              <th>Ready</th>
              <th>Campaign</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {runs.length ? (
              runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link href={`/campaigns/website-audits/${run.id}`} style={{ fontWeight: 760 }}>
                      {run.name}
                    </Link>
                    <br />
                    <span className="muted">{run.source}</span>
                  </td>
                  <td>{run.selectedOffer?.name || <span className="muted">Not selected</span>}</td>
                  <td>
                    <StatusBadge label={websiteAuditRunStatusLabels[run.status]} status={run.status} />
                  </td>
                  <td>{formatNumber(run._count.candidates)}</td>
                  <td>
                    <AuditReadiness runId={run.id} />
                  </td>
                  <td>
                    {run.campaign ? (
                      <Link href={`/campaigns/${run.campaign.id}`}>{run.campaign.name}</Link>
                    ) : (
                      <span className="muted">Not created</span>
                    )}
                  </td>
                  <td>{formatDate(run.createdAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title="No website audits yet"
                    description="Start with a list of business websites. AI will find pain points and prepare emails for your review."
                    action={
                      <Link className="button" href="/campaigns/website-audits/new">
                        <Globe2 size={16} aria-hidden="true" /> Add websites
                      </Link>
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

async function AuditReadiness({ runId }: { runId: string }) {
  const [approved, needsReview] = await Promise.all([
    prisma.websiteAuditCandidate.count({
      where: { runId, status: WebsiteAuditCandidateStatus.APPROVED }
    }),
    prisma.websiteAuditCandidate.count({
      where: { runId, status: WebsiteAuditCandidateStatus.NEEDS_REVIEW }
    })
  ]);

  return (
    <>
      {formatNumber(approved)} approved
      {needsReview ? (
        <>
          <br />
          <span className="muted">{formatNumber(needsReview)} need review</span>
        </>
      ) : null}
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="panel metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{formatNumber(value)}</p>
      <p className="metric-note">{note}</p>
    </div>
  );
}
