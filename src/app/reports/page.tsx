import { DealStatus, EmailMessageStatus, LeadStatus, ReplyIntent } from "@prisma/client";
import { BarChart3, MailCheck, Reply, ShieldCheck, Target } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { leadStatusLabels, replyIntentLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const range = parseReportRange(params);
  const messageDateWhere = dateRangeWhere(range, "createdAt");
  const replyDateWhere = dateRangeWhere(range, "receivedAt");
  const leadDateWhere = dateRangeWhere(range, "createdAt");
  const dealDateWhere = dateRangeWhere(range, "updatedAt");
  const campaignActivityWhere = range.isAllTime
    ? {}
    : {
        OR: [
          { emailMessages: { some: messageDateWhere } },
          { inboundReplies: { some: { ...replyDateWhere, intent: { not: ReplyIntent.NON_SALES } } } }
        ]
      };

  const [
    sent,
    failed,
    skipped,
    replyCounts,
    leadCounts,
    dealCounts,
    topCampaigns,
    sourceGroups
  ] = await Promise.all([
    prisma.emailMessage.count({
      where: { status: EmailMessageStatus.SENT, ...(range.isAllTime ? {} : dateRangeWhere(range, "sentAt")) }
    }),
    prisma.emailMessage.count({
      where: { status: EmailMessageStatus.FAILED, ...(range.isAllTime ? {} : dateRangeWhere(range, "failedAt")) }
    }),
    prisma.emailMessage.count({
      where: { status: EmailMessageStatus.SKIPPED, ...(range.isAllTime ? {} : dateRangeWhere(range, "skippedAt")) }
    }),
    prisma.inboundReply.groupBy({
      by: ["intent"],
      where: { ...replyDateWhere, intent: { not: ReplyIntent.NON_SALES }, OR: [{ leadId: null }, { lead: { deletedAt: null } }] },
      _count: { intent: true }
    }),
    prisma.lead.groupBy({ by: ["status"], where: { deletedAt: null, ...leadDateWhere }, _count: { status: true } }),
    prisma.deal.groupBy({ by: ["status"], where: { lead: { deletedAt: null }, ...dealDateWhere }, _count: { status: true } }),
    prisma.campaign.findMany({
      where: campaignActivityWhere,
      include: {
        offer: true,
        emailMessages: { select: { status: true, createdAt: true, sentAt: true, failedAt: true, skippedAt: true } },
        inboundReplies: { where: { intent: { not: ReplyIntent.NON_SALES } }, select: { receivedAt: true } },
        _count: { select: { recipients: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 8
    }),
    prisma.lead.groupBy({
      by: ["source"],
      where: { deletedAt: null, ...leadDateWhere },
      _count: true,
      _avg: { scoreIntent: true, scoreEngagement: true }
    })
  ]);
  const topSources = sourceGroups.sort((a, b) => b._count - a._count).slice(0, 8);

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
        description={`Use this view to judge reply quality, sender safety, source quality, and hot-lead production. Active range: ${range.label}.`}
      />

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div>
            <h2>Date range</h2>
            <p className="muted">{range.summary}</p>
          </div>
        </div>
        <div className="panel-body">
          <form className="form-grid" action="/reports">
            <label className="field">
              <span>Range</span>
              <select className="select" name="range" defaultValue={range.key}>
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="custom">Custom date range</option>
              </select>
            </label>
            <label className="field">
              <span>Start date</span>
              <input className="input" name="start" type="date" defaultValue={range.startInput ?? ""} />
            </label>
            <label className="field">
              <span>End date</span>
              <input className="input" name="end" type="date" defaultValue={range.endInput ?? ""} />
            </label>
            <button className="secondary-button" type="submit">
              Apply range
            </button>
          </form>
        </div>
      </section>

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
                  <th>Sent</th>
                  <th>Queued</th>
                  <th>Replies</th>
                </tr>
              </thead>
              <tbody>
                {topCampaigns.length ? (
                  topCampaigns.map((campaign) => {
                    const sentMessages = countCampaignMessages(
                      campaign.emailMessages,
                      EmailMessageStatus.SENT,
                      range
                    );
                    const queuedMessages =
                      countCampaignMessages(campaign.emailMessages, EmailMessageStatus.QUEUED, range) +
                      countCampaignMessages(campaign.emailMessages, EmailMessageStatus.SENDING, range);
                    const failedMessages = countCampaignMessages(
                      campaign.emailMessages,
                      EmailMessageStatus.FAILED,
                      range
                    );
                    const skippedMessages = countCampaignMessages(
                      campaign.emailMessages,
                      EmailMessageStatus.SKIPPED,
                      range
                    );

                    return (
                      <tr key={campaign.id}>
                        <td>{campaign.name}</td>
                        <td>{campaign.offer.name}</td>
                        <td>{formatNumber(campaign._count.recipients)}</td>
                        <td>{formatNumber(sentMessages)}</td>
                        <td>
                          {formatNumber(queuedMessages)}
                          {failedMessages || skippedMessages ? (
                            <>
                              <br />
                              <span className="muted">
                                {formatNumber(skippedMessages)} skipped, {formatNumber(failedMessages)} failed
                              </span>
                            </>
                          ) : null}
                        </td>
                        <td>{formatNumber(campaign.inboundReplies.filter((reply) => inRange(reply.receivedAt, range)).length)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6}>
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
                      <td>{formatNumber(source._count)}</td>
                      <td>{Math.round(source._avg?.scoreIntent ?? 0)}</td>
                      <td>{Math.round(source._avg?.scoreEngagement ?? 0)}</td>
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

function countReply(counts: Array<{ intent: ReplyIntent; _count: { intent: number } }>, intent: ReplyIntent) {
  return counts.find((item) => item.intent === intent)?._count.intent ?? 0;
}

function countLead(counts: Array<{ status: LeadStatus; _count: { status: number } }>, status: LeadStatus) {
  return counts.find((item) => item.status === status)?._count.status ?? 0;
}

function countDeal(counts: Array<{ status: DealStatus; _count: { status: number } }>, status: DealStatus) {
  return counts.find((item) => item.status === status)?._count.status ?? 0;
}

function countCampaignMessages(
  messages: Array<{
    status: EmailMessageStatus;
    createdAt: Date;
    sentAt: Date | null;
    failedAt: Date | null;
    skippedAt: Date | null;
  }>,
  status: EmailMessageStatus,
  range: ReportRange
) {
  return messages.filter((message) => message.status === status && inRange(messageDate(message), range)).length;
}

type ReportRange = {
  key: "all" | "7d" | "30d" | "90d" | "custom";
  label: string;
  summary: string;
  start: Date | null;
  end: Date | null;
  startInput?: string;
  endInput?: string;
  isAllTime: boolean;
};

function parseReportRange(params: { range?: string; start?: string; end?: string }): ReportRange {
  const key = ["7d", "30d", "90d", "custom"].includes(params.range || "")
    ? (params.range as ReportRange["key"])
    : "all";
  if (key === "all") {
    return { key, label: "All time", summary: "Showing all active recorded activity.", start: null, end: null, isAllTime: true };
  }
  if (key === "custom") {
    const start = parseKuwaitDateInput(params.start, "start");
    const end = parseKuwaitDateInput(params.end, "end");
    const validStart = start && end && start <= end ? start : null;
    const validEnd = start && end && start <= end ? end : null;
    return {
      key,
      label: validStart && validEnd ? `${formatDate(validStart)} to ${formatDate(validEnd)}` : "Custom range",
      summary: validStart && validEnd ? "Showing activity inside the selected custom dates." : "Choose a start and end date to apply a custom range.",
      start: validStart,
      end: validEnd,
      startInput: params.start,
      endInput: params.end,
      isAllTime: !validStart || !validEnd
    };
  }

  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    key,
    label: `Last ${days} days`,
    summary: `Showing activity from ${formatDate(start)} through ${formatDate(end)}.`,
    start,
    end,
    startInput: inputDate(start),
    endInput: inputDate(end),
    isAllTime: false
  };
}

function parseKuwaitDateInput(value: string | undefined, side: "start" | "end") {
  if (!value) return null;
  const suffix = side === "start" ? "T00:00:00+03:00" : "T23:59:59+03:00";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inputDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuwait",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function dateRangeWhere(range: ReportRange, field: string) {
  if (range.isAllTime || !range.start || !range.end) return {};
  return { [field]: { gte: range.start, lte: range.end } };
}

function inRange(date: Date | null | undefined, range: ReportRange) {
  if (range.isAllTime || !range.start || !range.end) return true;
  if (!date) return false;
  return date >= range.start && date <= range.end;
}

function messageDate(message: {
  status: EmailMessageStatus;
  createdAt: Date;
  sentAt: Date | null;
  failedAt: Date | null;
  skippedAt: Date | null;
}) {
  if (message.status === EmailMessageStatus.SENT) return message.sentAt;
  if (message.status === EmailMessageStatus.FAILED) return message.failedAt;
  if (message.status === EmailMessageStatus.SKIPPED) return message.skippedAt;
  return message.createdAt;
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
