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
        title="Campaigns"
        description="Create WhatsApp or email outreach, review the message, and start safely."
        actions={
          <>
            <Link className="secondary-button" href="/whatsapp/templates">
              Message Templates
            </Link>
            <Link className="secondary-button" href="/campaigns/new">
              Create Email
            </Link>
            <Link className="button" href="/whatsapp/campaigns/new">
              <Plus size={16} aria-hidden="true" /> Create WhatsApp
            </Link>
          </>
        }
      />

      <section className="grid grid-4" aria-label="Campaign metrics">
        <Metric icon={<Send size={18} />} label="Campaigns" value={totalCount} note="Email campaigns" />
        <Metric
          icon={<AlertTriangle size={18} />}
          label="Needs fixes"
          value={blockedCount}
          note="Review before sending"
        />
        <Metric
          icon={<CheckCircle2 size={18} />}
          label="Sending now"
          value={scheduledCount}
          note="Running or ready"
        />
        <Metric
          icon={<CheckCircle2 size={18} />}
          label="Finished"
          value={completedCount}
          note="Completed campaigns"
        />
      </section>

      <section className="table-wrap" aria-label="Campaign table" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Service</th>
              <th>Goal</th>
              <th>Status</th>
              <th>People</th>
              <th>Safety check</th>
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
                      <span className="muted">{campaign._count.steps} follow-up steps</span>
                    </td>
                    <td>{campaign.offer.name}</td>
                    <td>{objectiveLabels[campaign.objective]}</td>
                    <td>
                      <StatusBadge label={campaignStatusLabels[campaign.status]} status={campaign.status} />
                    </td>
                    <td>{formatNumber(campaign._count.recipients)}</td>
                    <td>
                      <SafetyIssues reviews={campaign.reviews} blockers={blockers} warnings={warnings} />
                    </td>
                    <td>{formatDate(campaign.createdAt)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    No campaigns yet. Create a campaign when your leads and message are ready.
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

type CampaignReviewSummary = {
  id: string;
  campaignId: string;
  key: string;
  label: string;
  message: string;
  severity: CampaignReviewSeverity;
};

function SafetyIssues({
  reviews,
  blockers,
  warnings
}: {
  reviews: CampaignReviewSummary[];
  blockers: number;
  warnings: number;
}) {
  const issues = reviews
    .filter((review) => review.severity !== CampaignReviewSeverity.PASS)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  if (!reviews.length) {
    return <span className="muted">Not checked yet</span>;
  }

  if (!issues.length) {
    return <span className="success-text">Ready</span>;
  }

  const issueCountLabel = blockers
    ? `${blockers} ${blockers === 1 ? "fix needed" : "fixes needed"}`
    : `${warnings} ${warnings === 1 ? "warning" : "warnings"}`;

  return (
    <details className={`table-issue-details ${blockers ? "table-issue-danger" : "table-issue-warning"}`}>
      <summary>{issueCountLabel}</summary>
      <div className="table-issue-panel">
        <strong>{blockers ? "Fix before sending" : "Review before sending"}</strong>
        <ul>
          {issues.map((issue) => {
            const copy = plainReviewCopy(issue);
            return (
              <li key={issue.id}>
                <span>{copy.label}</span>
                <small>{copy.message}</small>
              </li>
            );
          })}
        </ul>
        <Link href={`/campaigns/${reviews[0]?.campaignId ?? ""}`} className="table-issue-link">
          Open campaign
        </Link>
      </div>
    </details>
  );
}

function severityRank(severity: CampaignReviewSeverity) {
  if (severity === CampaignReviewSeverity.BLOCK) return 0;
  if (severity === CampaignReviewSeverity.WARNING) return 1;
  return 2;
}

function plainReviewCopy(review: CampaignReviewSummary) {
  const copyByKey: Record<string, { label: string; message: string }> = {
    audience: {
      label: "No ready people selected",
      message: "Choose at least one lead that has enough contact information."
    },
    suppression: {
      label: "Someone is on the Do Not Contact list",
      message: "Remove blocked people before starting this campaign."
    },
    lead_compliance: {
      label: "Lead permission details are missing",
      message: "Add country, lead source, and why you are allowed to contact them."
    },
    unsubscribe: {
      label: "Unsubscribe text is missing",
      message: "Add an unsubscribe line so people can opt out."
    },
    sender_identity: {
      label: "Business details are missing",
      message: "Add sender name, sender email, business address, and unsubscribe link in Settings."
    },
    claims: {
      label: "Message has blocked wording",
      message: "Remove wording that this service is not allowed to promise."
    },
    sequence_length: {
      label: "Too many follow-ups",
      message: "Shorter campaigns are safer while testing."
    }
  };

  return copyByKey[review.key] ?? { label: review.label, message: review.message };
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
