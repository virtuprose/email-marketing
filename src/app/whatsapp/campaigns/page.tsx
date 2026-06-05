import { WhatsappCampaignStatus } from "@prisma/client";
import { ArrowLeft, Plus, Send } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { whatsappCampaignStatusLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function WhatsappCampaignsPage() {
  const [campaigns, total, scheduled, blocked, completed] = await Promise.all([
    prisma.whatsappCampaign.findMany({
      include: {
        offer: true,
        template: true,
        _count: { select: { recipients: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.whatsappCampaign.count(),
    prisma.whatsappCampaign.count({
      where: { status: { in: [WhatsappCampaignStatus.SCHEDULED, WhatsappCampaignStatus.SENDING] } }
    }),
    prisma.whatsappCampaign.count({ where: { status: WhatsappCampaignStatus.REVIEW_BLOCKED } }),
    prisma.whatsappCampaign.count({ where: { status: WhatsappCampaignStatus.COMPLETED } })
  ]);

  return (
    <>
      <PageHeader
        eyebrow="WhatsApp Campaigns"
        title="Template campaign sends"
        description="Create approved-template sends for opted-in WhatsApp leads, with throttling, pause controls, and delivery tracking."
        actions={
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Link className="secondary-button" href="/whatsapp">
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </Link>
            <Link className="button" href="/whatsapp/campaigns/new">
              <Plus size={16} aria-hidden="true" /> New campaign
            </Link>
          </div>
        }
      />

      <section className="grid grid-4" aria-label="WhatsApp campaign metrics">
        <Metric label="Campaigns" value={total} note="All WhatsApp sends" />
        <Metric label="Sending" value={scheduled} note="Queued or running" />
        <Metric label="Blocked" value={blocked} note="Needs template or audience" />
        <Metric label="Completed" value={completed} note="Finished jobs" />
      </section>

      <section className="table-wrap" aria-label="WhatsApp campaigns table" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Offer</th>
              <th>Template</th>
              <th>Status</th>
              <th>Recipients</th>
              <th>Daily cap</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length ? (
              campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>
                    <Link href={`/whatsapp/campaigns/${campaign.id}`} style={{ fontWeight: 760 }}>
                      {campaign.name}
                    </Link>
                  </td>
                  <td>{campaign.offer.name}</td>
                  <td>
                    {campaign.template.name}
                    <br />
                    <span className="muted">{campaign.template.metaTemplateName}</span>
                  </td>
                  <td>
                    <StatusBadge
                      label={whatsappCampaignStatusLabels[campaign.status]}
                      status={campaign.status}
                    />
                  </td>
                  <td>{formatNumber(campaign._count.recipients)}</td>
                  <td>{formatNumber(campaign.dailyCap)}/day</td>
                  <td>{formatDate(campaign.createdAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    No WhatsApp campaigns yet. Add an approved template, then create a campaign.
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

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="panel metric">
      <p className="metric-label">
        <Send size={18} aria-hidden="true" /> {label}
      </p>
      <p className="metric-value">{formatNumber(value)}</p>
      <p className="metric-note">{note}</p>
    </div>
  );
}
