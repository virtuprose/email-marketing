import { DealStatus, EmailMessageStatus, LeadStatus, ReplyIntent } from "@prisma/client";
import { BarChart3, MailCheck, Reply, ShieldCheck, Target } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { leadStatusLabels, replyIntentLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [messageCounts, replyCounts, leadCounts, dealCounts, topCampaigns, topSources] = await Promise.all([
    prisma.emailMessage.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.inboundReply.groupBy({ by: ["intent"], _count: { intent: true } }),
    prisma.lead.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.deal.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.campaign.findMany({
      include: {
        offer: true,
        _count: { select: { recipients: true, inboundReplies: true, emailMessages: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 8
    }),
    prisma.lead.groupBy({
      by: ["source"],
      _count: { source: true },
      _avg: { scoreIntent: true, scoreEngagement: true },
      orderBy: { _count: { source: "desc" } },
      take: 8
    })
  ]);

  const sent = countMessage(messageCounts, EmailMessageStatus.SENT);
  const failed = countMessage(messageCounts, EmailMessageStatus.FAILED);
  const skipped = countMessage(messageCounts, EmailMessageStatus.SKIPPED);
  const totalReplies = replyCounts.reduce((sum, item) => sum + item._count.intent, 0);
  const hotReplies =
    countReply(replyCounts, ReplyIntent.HOT_LEAD) +
    countReply(replyCounts, ReplyIntent.MEETING_REQUEST) +
    countReply(replyCounts, ReplyIntent.PRICING_REQUEST);
  const suppressed =
    countLead(leadCounts, LeadStatus.UNSUBSCRIBED) +
    countLead(leadCounts, LeadStatus.DO_NOT_CONTACT) +
    countLead(leadCounts, LeadStatus.SUPPRESSED);
  const wonDeals = countDeal(dealCounts, DealStatus.WON);

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Reports"
        description="Use this view to judge reply quality, sender safety, source quality, and hot-lead production instead of chasing vanity metrics."
      />

      <section className="grid grid-4" aria-label="Performance summary">
        <Metric icon={<MailCheck size={18} />} label="Sent" value={sent} note="Campaign messages sent" />
        <Metric icon={<Reply size={18} />} label="Replies" value={totalReplies} note="Inbound responses" />
        <Metric
          icon={<Target size={18} />}
          label="Hot replies"
          value={hotReplies}
          note="Owner-ready intent"
        />
        <Metric
          icon={<ShieldCheck size={18} />}
          label="Suppressed"
          value={suppressed}
          note="Stopped contacts"
        />
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Sending safety</h2>
              <p className="muted">Counts reflect queue outcomes recorded by the worker.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <ProgressRow label="Sent" value={sent} total={sent + failed + skipped} />
            <ProgressRow label="Skipped" value={skipped} total={sent + failed + skipped} />
            <ProgressRow label="Failed" value={failed} total={sent + failed + skipped} danger />
            <div className="alert">
              Open and click tracking are directional only. Reply quality and hot-lead rate matter more.
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Reply intent mix</h2>
              <p className="muted">Shows what the AI is seeing in conversations.</p>
            </div>
            <BarChart3 size={18} aria-hidden="true" />
          </div>
          <div className="panel-body stack">
            {replyCounts.length ? (
              replyCounts
                .sort((a, b) => b._count.intent - a._count.intent)
                .map((item) => (
                  <ProgressRow
                    key={item.intent}
                    label={replyIntentLabels[item.intent]}
                    value={item._count.intent}
                    total={totalReplies}
                  />
                ))
            ) : (
              <div className="empty-state">No replies classified yet.</div>
            )}
          </div>
        </section>
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Campaign performance</h2>
              <p className="muted">Reply count is more important than opens for cold outreach decisions.</p>
            </div>
          </div>
          <div className="table-wrap embedded-table" aria-label="Campaign report">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Offer</th>
                  <th>Recipients</th>
                  <th>Messages</th>
                  <th>Replies</th>
                </tr>
              </thead>
              <tbody>
                {topCampaigns.length ? (
                  topCampaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>{campaign.name}</td>
                      <td>{campaign.offer.name}</td>
                      <td>{formatNumber(campaign._count.recipients)}</td>
                      <td>{formatNumber(campaign._count.emailMessages)}</td>
                      <td>{formatNumber(campaign._count.inboundReplies)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">No campaigns yet.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Lead source quality</h2>
              <p className="muted">Bad sources should be stopped before they hurt the domain.</p>
            </div>
          </div>
          <div className="table-wrap embedded-table" aria-label="Source quality report">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Leads</th>
                  <th>Avg intent</th>
                  <th>Avg engagement</th>
                </tr>
              </thead>
              <tbody>
                {topSources.length ? (
                  topSources.map((source) => (
                    <tr key={source.source ?? "missing"}>
                      <td>{source.source || <span className="muted">Missing</span>}</td>
                      <td>{formatNumber(source._count.source)}</td>
                      <td>{Math.round(source._avg.scoreIntent ?? 0)}</td>
                      <td>{Math.round(source._avg.scoreEngagement ?? 0)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">No lead sources yet.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div>
            <h2>Lead status snapshot</h2>
            <p className="muted">
              Won deals: {formatNumber(wonDeals)}. Keep suppressed and negative statuses out of new campaigns.
            </p>
          </div>
        </div>
        <div className="panel-body tag-list">
          {leadCounts.map((item) => (
            <span className="tag" key={item.status}>
              {leadStatusLabels[item.status]}: {formatNumber(item._count.status)}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}

function countMessage(
  counts: Array<{ status: EmailMessageStatus; _count: { status: number } }>,
  status: EmailMessageStatus
) {
  return counts.find((item) => item.status === status)?._count.status ?? 0;
}

function countReply(counts: Array<{ intent: ReplyIntent; _count: { intent: number } }>, intent: ReplyIntent) {
  return counts.find((item) => item.intent === intent)?._count.intent ?? 0;
}

function countLead(counts: Array<{ status: LeadStatus; _count: { status: number } }>, status: LeadStatus) {
  return counts.find((item) => item.status === status)?._count.status ?? 0;
}

function countDeal(counts: Array<{ status: DealStatus; _count: { status: number } }>, status: DealStatus) {
  return counts.find((item) => item.status === status)?._count.status ?? 0;
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

function ProgressRow({
  label,
  value,
  total,
  danger
}: {
  label: string;
  value: number;
  total: number;
  danger?: boolean;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="progress-row">
      <div className="profile-row">
        <span>{label}</span>
        <span>
          {formatNumber(value)} / {percent}%
        </span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <span
          className={danger ? "progress-fill danger-fill" : "progress-fill"}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
