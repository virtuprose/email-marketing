import { MessageCircle, Plus, Send, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { isMetaWhatsappConfigured, isMetaWhatsappDryRun } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const [templates, campaigns, eligibleLeads, hotReplies, activeJobs] = await Promise.all([
    prisma.whatsappTemplate.count({ where: { active: true, status: "APPROVED" } }),
    prisma.whatsappCampaign.count(),
    prisma.lead.count({
      where: {
        phoneE164: { not: null },
        whatsappOptIn: true,
        whatsappStatus: "OPTED_IN",
        whatsappStoppedAt: null
      }
    }),
    prisma.inboundReply.count({ where: { channel: "WHATSAPP", status: "HOT_HANDOFF" } }),
    prisma.whatsappSendJob.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } })
  ]);
  const metaReady = isMetaWhatsappConfigured();
  const dryRun = isMetaWhatsappDryRun();

  return (
    <>
      <PageHeader
        eyebrow="WhatsApp"
        title="WhatsApp"
        description="Send approved WhatsApp messages to people with permission, track delivery, and let AI qualify replies before handoff."
        actions={
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Link className="secondary-button" href="/whatsapp/templates">
              Message Templates
            </Link>
            <Link className="button" href="/whatsapp/campaigns/new">
              <Plus size={16} aria-hidden="true" /> Create Campaign
            </Link>
          </div>
        }
      />

      <section className="grid grid-4" aria-label="WhatsApp metrics">
        <Metric
          icon={<MessageCircle size={18} />}
          label="Ready messages"
          value={templates}
          note="Approved by WhatsApp"
        />
        <Metric icon={<Send size={18} />} label="Campaigns" value={campaigns} note="Drafts and sends" />
        <Metric
          icon={<Sparkles size={18} />}
          label="Ready leads"
          value={eligibleLeads}
          note="Phone + permission"
        />
        <Metric icon={<TriangleAlert size={18} />} label="Hot leads" value={hotReplies} note="Needs you" />
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Readiness</h2>
              <p className="muted">
                Keep test mode on until your first WhatsApp message is reviewed and tested.
              </p>
            </div>
          </div>
          <div className="panel-body stack">
            <div className="profile-row">
              <span>WhatsApp connection</span>
              <StatusBadge
                label={metaReady ? "Configured" : "Missing"}
                status={metaReady ? "ACTIVE" : "NOT_CONFIGURED"}
              />
            </div>
            <div className="profile-row">
              <span>Send mode</span>
              <StatusBadge
                label={dryRun ? "Test mode" : "Live sending"}
                status={dryRun ? "WARNING" : "ACTIVE"}
              />
            </div>
            <div className="profile-row">
              <span>Campaigns sending</span>
              <span>{formatNumber(activeJobs)}</span>
            </div>
            <div className="alert">
              WhatsApp sends are blocked unless the lead has a full phone number, permission, and has not
              asked to stop.
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Work areas</h2>
              <p className="muted">Use these in order when testing the MVP.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <Link className="reply-list-item" href="/whatsapp/templates">
              <span className="reply-list-main">
                <strong>1. Add approved messages</strong>
                <span>
                  Save the WhatsApp message name, language, personal words, preview, and approval status.
                </span>
              </span>
            </Link>
            <Link className="reply-list-item" href="/whatsapp/campaigns/new">
              <span className="reply-list-main">
                <strong>2. Create WhatsApp campaign</strong>
                <span>Select service, audience, personal words, sending limit, and owner approval.</span>
              </span>
            </Link>
            <Link className="reply-list-item" href="/whatsapp/inbox">
              <span className="reply-list-main">
                <strong>3. Review AI-qualified replies</strong>
                <span>Review hot leads, AI summaries, and suggested replies.</span>
              </span>
            </Link>
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
