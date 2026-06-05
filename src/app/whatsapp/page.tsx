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
        title="WhatsApp command center"
        description="Send approved Meta templates to opted-in clients, track delivery, and let AI qualify replies before owner handoff."
        actions={
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Link className="secondary-button" href="/whatsapp/templates">
              Templates
            </Link>
            <Link className="button" href="/whatsapp/campaigns/new">
              <Plus size={16} aria-hidden="true" /> New campaign
            </Link>
          </div>
        }
      />

      <section className="grid grid-4" aria-label="WhatsApp metrics">
        <Metric
          icon={<MessageCircle size={18} />}
          label="Approved templates"
          value={templates}
          note="Stored locally"
        />
        <Metric icon={<Send size={18} />} label="Campaigns" value={campaigns} note="Drafts and sends" />
        <Metric
          icon={<Sparkles size={18} />}
          label="Eligible leads"
          value={eligibleLeads}
          note="Phone + opt-in"
        />
        <Metric
          icon={<TriangleAlert size={18} />}
          label="Hot handoffs"
          value={hotReplies}
          note="Needs owner"
        />
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Readiness</h2>
              <p className="muted">
                Connect Meta Cloud API and keep dry-run on until the first campaign is reviewed.
              </p>
            </div>
          </div>
          <div className="panel-body stack">
            <div className="profile-row">
              <span>Meta credentials</span>
              <StatusBadge
                label={metaReady ? "Configured" : "Missing"}
                status={metaReady ? "ACTIVE" : "NOT_CONFIGURED"}
              />
            </div>
            <div className="profile-row">
              <span>Meta send mode</span>
              <StatusBadge
                label={dryRun ? "Dry-run" : "Live sending"}
                status={dryRun ? "WARNING" : "ACTIVE"}
              />
            </div>
            <div className="profile-row">
              <span>Active jobs</span>
              <span>{formatNumber(activeJobs)}</span>
            </div>
            <div className="alert">
              WhatsApp sends are blocked unless the lead has an E.164 phone number, opt-in, and no stop flag.
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
                <strong>1. Add approved templates</strong>
                <span>Store Meta template name, variables, language, preview, and approval status.</span>
              </span>
            </Link>
            <Link className="reply-list-item" href="/whatsapp/campaigns/new">
              <span className="reply-list-main">
                <strong>2. Build template campaign</strong>
                <span>Select offer, audience, variables, cap, and owner approval.</span>
              </span>
            </Link>
            <Link className="reply-list-item" href="/whatsapp/inbox">
              <span className="reply-list-main">
                <strong>3. Work AI-qualified replies</strong>
                <span>Review hot handoffs, AI summaries, and sent drafts.</span>
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
