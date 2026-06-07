import { ArrowRight, Flame, Inbox, Send, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getAiAssistantSettings } from "@/lib/ai-assistant";
import { imapReplyInboxConfigured } from "@/lib/email-inbox";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ensureDefaultSendingAccount, smtpPasswordConfigured } from "@/lib/sending";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [
    readyLeadCount,
    skippedCount,
    runningCampaignCount,
    sentEmailToday,
    sentWhatsappToday,
    hotReplyCount,
    ownerReviewCount,
    hotLeadCount,
    approvedWhatsappTemplateCount,
    recentImports,
    hotDeals,
    aiSettings,
    sendingAccount
  ] = await Promise.all([
    prisma.lead.count({
      where: { status: { notIn: ["SUPPRESSED", "UNSUBSCRIBED", "BOUNCED", "DO_NOT_CONTACT"] } }
    }),
    prisma.suppressionEntry.count(),
    prisma.campaign.count({ where: { status: { in: ["SCHEDULED", "SENDING"] } } }),
    prisma.emailMessage.count({ where: { status: "SENT", sentAt: { gte: today } } }),
    prisma.whatsappMessage.count({
      where: { status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { gte: today } }
    }),
    prisma.inboundReply.count({ where: { status: "HOT_HANDOFF" } }),
    prisma.inboundReply.count({ where: { ownerActionRequired: true } }),
    prisma.deal.count({ where: { stage: { in: ["HOT", "OWNER_HANDLING"] }, status: "OPEN" } }),
    prisma.whatsappTemplate.count({ where: { active: true, status: "APPROVED" } }),
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.deal.findMany({
      where: { stage: { in: ["HOT", "OWNER_HANDLING"] }, status: "OPEN" },
      include: { lead: true, offer: true },
      orderBy: [{ priorityScore: "desc" }, { updatedAt: "desc" }],
      take: 5
    }),
    getAiAssistantSettings(),
    ensureDefaultSendingAccount()
  ]);
  const messagesToday = sentEmailToday + sentWhatsappToday;
  const hotLeadEmailAlertsLive =
    !sendingAccount.dryRun &&
    Boolean(sendingAccount.host && sendingAccount.username && smtpPasswordConfigured());
  const setupWarningItems = [
    approvedWhatsappTemplateCount > 0 ? null : "Add one approved WhatsApp message.",
    process.env.OPENAI_API_KEY ? null : "Add OpenAI key for high-quality AI replies.",
    aiSettings.enabled && aiSettings.mode !== "PAUSED" ? null : "AI Assistant is paused.",
    hotLeadEmailAlertsLive ? null : "Make hot lead email alerts live.",
    imapReplyInboxConfigured() ? null : "Connect email reply inbox when email replies are needed."
  ].filter(Boolean) as string[];
  const setupWarnings = setupWarningItems.length;

  return (
    <>
      <PageHeader
        eyebrow="Home"
        title="Today’s work"
        description="Add leads, start safe campaigns, review replies, and focus on people who are ready to talk."
        actions={
          <>
            <Link className="secondary-button" href="/leads/import">
              Add Leads <UsersRound size={16} aria-hidden="true" />
            </Link>
            <Link className="button" href="/campaigns">
              Create Campaign <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </>
        }
      />

      <section className="panel attention-panel" aria-label="What needs your attention today">
        <div className="panel-header">
          <div>
            <h2>What needs your attention today</h2>
            <p className="muted">Start with the items that can turn into client conversations.</p>
          </div>
        </div>
        <div className="panel-body priority-list">
          <PriorityItem
            href="/pipeline"
            icon={<Flame size={18} />}
            title="Hot leads waiting"
            value={hotLeadCount}
            note="People AI thinks you should handle personally."
          />
          <PriorityItem
            href="/inbox"
            icon={<Inbox size={18} />}
            title="Replies to review"
            value={ownerReviewCount}
            note="Replies where AI wants your decision."
          />
          <PriorityItem
            href="/campaigns"
            icon={<Send size={18} />}
            title="Campaigns currently sending"
            value={runningCampaignCount}
            note="Active outreach running in the background."
          />
          <PriorityItem
            href="/ai-assistant"
            icon={<ShieldCheck size={18} />}
            title="Setup warnings"
            value={setupWarnings}
            note={setupWarnings ? setupWarningItems[0] : "Core setup looks ready."}
          />
        </div>
      </section>

      <section className="grid grid-4" aria-label="Owner metrics" style={{ marginTop: 16 }}>
        <Metric
          icon={<Flame size={18} />}
          label="Hot leads"
          value={hotLeadCount + hotReplyCount}
          note="Ready for your attention"
        />
        <Metric
          icon={<Inbox size={18} />}
          label="Replies to review"
          value={ownerReviewCount}
          note="Needs your decision"
        />
        <Metric
          icon={<UsersRound size={18} />}
          label="Ready leads"
          value={readyLeadCount}
          note="Can be used in campaigns"
        />
        <Metric
          icon={<Send size={18} />}
          label="Messages sent today"
          value={messagesToday}
          note={`${formatNumber(skippedCount)} people protected by safety list`}
        />
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Hot leads</h2>
              <p className="muted">These are the people most worth your personal follow-up.</p>
            </div>
          </div>
          <div className="panel-body stack">
            {hotDeals.length ? (
              hotDeals.map((deal) => (
                <Link className="profile-row" key={deal.id} href="/pipeline">
                  <span>{deal.lead.company || deal.lead.email}</span>
                  <span>{deal.offer?.name || `Strength ${deal.priorityScore}/100`}</span>
                </Link>
              ))
            ) : (
              <div className="empty-state">No hot leads yet. Add leads and start your first campaign.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Simple workflow</h2>
              <p className="muted">Use the assistant in this order.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <Step label="Add leads" status="VALIDATED" />
            <Step label="Choose service" status="VALIDATED" />
            <Step label="Create campaign" status="VALIDATED" />
            <Step label="Send safely" status="VALIDATED" />
            <Step label="Review replies" status="VALIDATED" />
            <Step label="Close hot leads" status="VALIDATED" />
          </div>
        </div>
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Latest leads added</h2>
              <p className="muted">Recent CSV uploads you can review.</p>
            </div>
          </div>
          <div className="panel-body stack">
            {recentImports.length ? (
              recentImports.map((batch) => (
                <Link className="profile-row" key={batch.id} href={`/leads/import/${batch.id}`}>
                  <span>{batch.filename}</span>
                  <span>{formatDate(batch.createdAt)}</span>
                </Link>
              ))
            ) : (
              <div className="empty-state">No imports yet.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Safety rules</h2>
              <p className="muted">These stay on so sending stays controlled.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <Step label="Test mode is clear before sending" status="VALIDATED" />
            <Step label="Pause all sending is always available" status="VALIDATED" />
            <Step label="People who opted out are skipped" status="VALIDATED" />
            <Step label="Missing contact details are skipped" status="VALIDATED" />
            <Step label="AI asks for help on risky replies" status="VALIDATED" />
          </div>
        </div>
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

function PriorityItem({
  href,
  icon,
  title,
  value,
  note
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  value: number;
  note: string;
}) {
  return (
    <Link className="priority-item" href={href}>
      <span className="priority-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{note}</small>
      </span>
      <strong className="priority-value">{formatNumber(value)}</strong>
    </Link>
  );
}

function Step({ label, status }: { label: string; status: "VALIDATED" | "NEW" }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <StatusBadge label={status === "VALIDATED" ? "Ready" : "Later phase"} status={status} />
    </div>
  );
}
