import { ArrowRight, Bot, Database, Flame, Send, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const [
    leadCount,
    suppressedCount,
    needsReviewCount,
    campaignCount,
    sentMessageCount,
    hotReplyCount,
    ownerReviewCount,
    openDealCount,
    recentImports,
    hotDeals
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.suppressionEntry.count(),
    prisma.lead.count({ where: { status: "NEW" } }),
    prisma.campaign.count(),
    prisma.emailMessage.count({ where: { status: "SENT" } }),
    prisma.inboundReply.count({ where: { status: "HOT_HANDOFF" } }),
    prisma.inboundReply.count({ where: { ownerActionRequired: true } }),
    prisma.deal.count({ where: { status: "OPEN" } }),
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.deal.findMany({
      where: { stage: "HOT", status: "OPEN" },
      include: { lead: true, offer: true },
      orderBy: [{ priorityScore: "desc" }, { updatedAt: "desc" }],
      take: 5
    })
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Command Center"
        title="Virtuprose AI sales command center"
        description="Import leads, launch safe outreach, let AI triage replies, and focus owner time on hot opportunities."
        actions={
          <>
            <Link className="secondary-button" href="/inbox">
              AI inbox <Bot size={16} aria-hidden="true" />
            </Link>
            <Link className="button" href="/campaigns/new">
              Create campaign <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </>
        }
      />

      <section className="grid grid-4" aria-label="Command center metrics">
        <Metric icon={<UsersRound size={18} />} label="Leads" value={leadCount} note="Imported contacts" />
        <Metric
          icon={<ShieldCheck size={18} />}
          label="Suppressed"
          value={suppressedCount}
          note="Blocked before send"
        />
        <Metric
          icon={<Database size={18} />}
          label="Needs review"
          value={needsReviewCount}
          note="Missing source/legal data"
        />
        <Metric
          icon={<Send size={18} />}
          label="Campaigns"
          value={campaignCount}
          note={`${formatNumber(sentMessageCount)} messages sent`}
        />
      </section>

      <section className="grid grid-4" aria-label="AI sales metrics" style={{ marginTop: 16 }}>
        <Metric
          icon={<Flame size={18} />}
          label="Hot replies"
          value={hotReplyCount}
          note="Owner-ready handoffs"
        />
        <Metric
          icon={<Bot size={18} />}
          label="Owner review"
          value={ownerReviewCount}
          note="AI needs decision"
        />
        <Metric
          icon={<Database size={18} />}
          label="Open deals"
          value={openDealCount}
          note="Pipeline items"
        />
        <Metric
          icon={<ShieldCheck size={18} />}
          label="Suppressed"
          value={suppressedCount}
          note="Protected sends"
        />
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Hot handoffs</h2>
              <p className="muted">These are the conversations where owner attention matters most.</p>
            </div>
          </div>
          <div className="panel-body stack">
            {hotDeals.length ? (
              hotDeals.map((deal) => (
                <Link className="profile-row" key={deal.id} href="/pipeline">
                  <span>{deal.lead.company || deal.lead.email}</span>
                  <span>{deal.offer?.name || `${deal.priorityScore}/100`}</span>
                </Link>
              ))
            ) : (
              <div className="empty-state">
                No hot handoffs yet. Replies will appear here after AI triage.
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Operating loop</h2>
              <p className="muted">Use the app in this order for the safest internal workflow.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <Step label="Import leads with source/legal basis" status="VALIDATED" />
            <Step label="Choose Virtuprose offer" status="VALIDATED" />
            <Step label="Generate and approve campaign" status="VALIDATED" />
            <Step label="Send through throttled queue" status="VALIDATED" />
            <Step label="AI classify and draft replies" status="VALIDATED" />
            <Step label="Owner closes hot deals" status="VALIDATED" />
          </div>
        </div>
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent imports</h2>
              <p className="muted">Review every import before using it in a campaign.</p>
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
              <h2>Production guardrails</h2>
              <p className="muted">Keep dry-run on until credentials, DNS, and inbox receipt are verified.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <Step label="Dry-run default" status="VALIDATED" />
            <Step label="Global kill switch" status="VALIDATED" />
            <Step label="Suppression before every send" status="VALIDATED" />
            <Step label="Replies stop queued follow-ups" status="VALIDATED" />
            <Step label="Inbound webhook secret required" status="VALIDATED" />
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

function Step({ label, status }: { label: string; status: "VALIDATED" | "NEW" }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <StatusBadge label={status === "VALIDATED" ? "Ready" : "Later phase"} status={status} />
    </div>
  );
}
