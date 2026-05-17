import { CampaignReviewSeverity, CampaignStatus } from "@prisma/client";
import { AlertTriangle, CheckCircle2, Plus, Send } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { objectiveLabels } from "@/lib/campaigns";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { campaignStatusLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const [campaigns, totalCount, blockedCount, scheduledCount, completedCount] = await Promise.all([
    prisma.campaign.findMany({
      include: {
        offer: true,
        reviews: true,
        _count: { select: { recipients: true, steps: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: CampaignStatus.REVIEW_BLOCKED } }),
    prisma.campaign.count({ where: { status: { in: [CampaignStatus.SCHEDULED, CampaignStatus.SENDING] } } }),
    prisma.campaign.count({ where: { status: CampaignStatus.COMPLETED } })
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Campaigns"
        title="Draft, approve, send safely"
        description="Phase 3 sends approved campaigns through a queue with suppression checks, unsubscribe links, rate limits, and pause controls."
        actions={
          <Link className="button" href="/campaigns/new">
            <Plus size={16} aria-hidden="true" /> New campaign
          </Link>
        }
      />

      <section className="grid grid-4" aria-label="Campaign metrics">
        <Metric
          icon={<Send size={18} />}
          label="Campaigns"
          value={totalCount}
          note="All drafts and approvals"
        />
        <Metric
          icon={<AlertTriangle size={18} />}
          label="Blocked"
          value={blockedCount}
          note="Needs safety fixes"
        />
        <Metric
          icon={<CheckCircle2 size={18} />}
          label="Sending"
          value={scheduledCount}
          note="Queued or running"
        />
        <Metric
          icon={<CheckCircle2 size={18} />}
          label="Completed"
          value={completedCount}
          note="Finished send jobs"
        />
      </section>

      <section className="table-wrap" aria-label="Campaign table" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Offer</th>
              <th>Objective</th>
              <th>Status</th>
              <th>Recipients</th>
              <th>Review</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length ? (
              campaigns.map((campaign) => {
                const blockers = campaign.reviews.filter(
                  (review) => review.severity === CampaignReviewSeverity.BLOCK
                ).length;
                const warnings = campaign.reviews.filter(
                  (review) => review.severity === CampaignReviewSeverity.WARNING
                ).length;

                return (
                  <tr key={campaign.id}>
                    <td>
                      <Link href={`/campaigns/${campaign.id}`} style={{ fontWeight: 760 }}>
                        {campaign.name}
                      </Link>
                      <br />
                      <span className="muted">{campaign._count.steps} sequence steps</span>
                    </td>
                    <td>{campaign.offer.name}</td>
                    <td>{objectiveLabels[campaign.objective]}</td>
                    <td>
                      <StatusBadge label={campaignStatusLabels[campaign.status]} status={campaign.status} />
                    </td>
                    <td>{formatNumber(campaign._count.recipients)}</td>
                    <td>
                      {campaign.reviews.length ? (
                        <span
                          className={blockers ? "danger-text" : warnings ? "warning-text" : "success-text"}
                        >
                          {blockers ? `${blockers} blockers` : warnings ? `${warnings} warnings` : "Passed"}
                        </span>
                      ) : (
                        <span className="muted">Not reviewed</span>
                      )}
                    </td>
                    <td>{formatDate(campaign.createdAt)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    No campaigns yet. Create the first draft from an approved Virtuprose offer.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Metric({
  icon,
  label,
  value,
  note
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="panel metric">
      <p className="metric-label">
        {icon} {label}
      </p>
      <p className="metric-value">{formatNumber(value)}</p>
      <p className="metric-note">{note}</p>
    </div>
  );
}
