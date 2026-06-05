import { SendJobStatus, WhatsappCampaignStatus, WhatsappMessageStatus } from "@prisma/client";
import { ArrowLeft, CheckCircle2, Pause, Play, Send } from "lucide-react";
import Link from "next/link";
import {
  approveWhatsappCampaign,
  pauseWhatsappCampaignSending,
  resumeWhatsappCampaignSending,
  scheduleApprovedWhatsappCampaign
} from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  sendJobStatusLabels,
  whatsappCampaignStatusLabels,
  whatsappMessageStatusLabels,
  whatsappRecipientStatusLabels,
  whatsappTemplateStatusLabels
} from "@/lib/status";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function WhatsappCampaignDetailPage({ params }: PageProps) {
  const { id } = await params;
  const campaign = await prisma.whatsappCampaign.findUnique({
    where: { id },
    include: {
      offer: true,
      template: true,
      recipients: {
        include: { lead: true },
        orderBy: { createdAt: "desc" },
        take: 25
      },
      sendJobs: {
        include: { messages: { orderBy: { queuedAt: "desc" }, take: 25, include: { lead: true } } },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!campaign) {
    return (
      <div className="empty-state">
        WhatsApp campaign not found. <Link href="/whatsapp/campaigns">Back to campaigns</Link>
      </div>
    );
  }

  const latestJob = campaign.sendJobs[0];
  const counts = await getMessageCounts(campaign.id);
  const canApprove = campaign.status === WhatsappCampaignStatus.REVIEW_READY;
  const canSchedule = campaign.status === WhatsappCampaignStatus.APPROVED;
  const pauseableStatuses: SendJobStatus[] = [SendJobStatus.QUEUED, SendJobStatus.RUNNING];
  const canPause = latestJob && pauseableStatuses.includes(latestJob.status);
  const canResume = latestJob?.status === SendJobStatus.PAUSED;

  return (
    <>
      <PageHeader
        eyebrow="WhatsApp Campaign"
        title={campaign.name}
        description="Review recipients, template, approval state, and delivery progress before handing replies to AI."
        actions={
          <Link className="secondary-button" href="/whatsapp/campaigns">
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </Link>
        }
      />

      <section className="grid grid-4" aria-label="WhatsApp send metrics">
        <Metric label="Queued" value={counts.queued} status={WhatsappMessageStatus.QUEUED} />
        <Metric label="Sent" value={counts.sent} status={WhatsappMessageStatus.SENT} />
        <Metric label="Delivered" value={counts.delivered} status={WhatsappMessageStatus.DELIVERED} />
        <Metric
          label="Failed/skipped"
          value={counts.failed + counts.skipped}
          status={WhatsappMessageStatus.FAILED}
        />
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Review</h2>
              <p className="muted">This campaign can only send through the approved Meta template.</p>
            </div>
            <StatusBadge label={whatsappCampaignStatusLabels[campaign.status]} status={campaign.status} />
          </div>
          <div className="panel-body stack">
            <div className="profile-list">
              <ProfileRow label="Offer" value={campaign.offer.name} />
              <ProfileRow label="Template" value={campaign.template.name} />
              <ProfileRow label="Meta template name" value={campaign.template.metaTemplateName} />
              <ProfileRow
                label="Template status"
                value={whatsappTemplateStatusLabels[campaign.template.status]}
              />
              <ProfileRow label="Recipients" value={formatNumber(campaign.recipients.length)} />
              <ProfileRow label="Daily cap" value={`${formatNumber(campaign.dailyCap)}/day`} />
            </div>

            {campaign.template.bodyPreview ? (
              <pre className="email-preview">{campaign.template.bodyPreview}</pre>
            ) : null}

            <div className="toolbar" style={{ marginBottom: 0 }}>
              {canApprove ? (
                <form action={approveWhatsappCampaign}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <button className="button" type="submit">
                    <CheckCircle2 size={16} aria-hidden="true" /> Approve
                  </button>
                </form>
              ) : null}
              {canSchedule ? (
                <form action={scheduleApprovedWhatsappCampaign}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <button className="button" type="submit">
                    <Send size={16} aria-hidden="true" /> Schedule send
                  </button>
                </form>
              ) : null}
              {canPause ? (
                <form action={pauseWhatsappCampaignSending}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <button className="secondary-button" type="submit">
                    <Pause size={16} aria-hidden="true" /> Pause
                  </button>
                </form>
              ) : null}
              {canResume ? (
                <form action={resumeWhatsappCampaignSending}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <button className="secondary-button" type="submit">
                    <Play size={16} aria-hidden="true" /> Resume
                  </button>
                </form>
              ) : null}
            </div>

            {campaign.status === WhatsappCampaignStatus.REVIEW_BLOCKED ? (
              <div className="danger-alert alert">
                This campaign cannot send because it has no eligible opted-in recipients or the template is
                not approved.
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Latest job</h2>
              <p className="muted">Worker progress updates after queued messages are processed.</p>
            </div>
            {latestJob ? (
              <StatusBadge label={sendJobStatusLabels[latestJob.status]} status={latestJob.status} />
            ) : null}
          </div>
          <div className="panel-body">
            {latestJob ? (
              <div className="profile-list">
                <ProfileRow label="Total" value={formatNumber(latestJob.totalRecipients)} />
                <ProfileRow label="Queued" value={formatNumber(latestJob.queuedMessages)} />
                <ProfileRow label="Sent" value={formatNumber(latestJob.sentMessages)} />
                <ProfileRow label="Delivered" value={formatNumber(latestJob.deliveredMessages)} />
                <ProfileRow label="Read" value={formatNumber(latestJob.readMessages)} />
                <ProfileRow label="Failed" value={formatNumber(latestJob.failedMessages)} />
                <ProfileRow label="Created" value={formatDate(latestJob.createdAt)} />
              </div>
            ) : (
              <div className="empty-state">Approve and schedule this campaign to create a send job.</div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="table-wrap" aria-label="WhatsApp recipients">
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {campaign.recipients.map((recipient) => (
                <tr key={recipient.id}>
                  <td>
                    {recipient.lead.company || recipient.lead.email}
                    <br />
                    <span className="muted">{recipient.lead.email}</span>
                  </td>
                  <td>{recipient.lead.phoneE164}</td>
                  <td>
                    <StatusBadge
                      label={whatsappRecipientStatusLabels[recipient.status]}
                      status={recipient.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="table-wrap" aria-label="Recent WhatsApp messages">
          <table>
            <thead>
              <tr>
                <th>Message</th>
                <th>Status</th>
                <th>Queued</th>
              </tr>
            </thead>
            <tbody>
              {latestJob?.messages.length ? (
                latestJob.messages.map((message) => (
                  <tr key={message.id}>
                    <td>
                      {message.lead.company || message.toPhoneE164}
                      <br />
                      <span className="muted">{message.providerMessageId || message.toPhoneE164}</span>
                    </td>
                    <td>
                      <StatusBadge
                        label={whatsappMessageStatusLabels[message.status]}
                        status={message.status}
                      />
                    </td>
                    <td>{formatDate(message.queuedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state">No queued messages yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}

async function getMessageCounts(campaignId: string) {
  const [queued, sent, delivered, read, failed, skipped] = await Promise.all([
    prisma.whatsappMessage.count({ where: { campaignId, status: WhatsappMessageStatus.QUEUED } }),
    prisma.whatsappMessage.count({ where: { campaignId, status: WhatsappMessageStatus.SENT } }),
    prisma.whatsappMessage.count({ where: { campaignId, status: WhatsappMessageStatus.DELIVERED } }),
    prisma.whatsappMessage.count({ where: { campaignId, status: WhatsappMessageStatus.READ } }),
    prisma.whatsappMessage.count({ where: { campaignId, status: WhatsappMessageStatus.FAILED } }),
    prisma.whatsappMessage.count({ where: { campaignId, status: WhatsappMessageStatus.SKIPPED } })
  ]);
  return { queued, sent, delivered, read, failed, skipped };
}

function Metric({ label, value, status }: { label: string; value: number; status: WhatsappMessageStatus }) {
  return (
    <div className="panel metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{formatNumber(value)}</p>
      <p className="metric-note">
        <StatusBadge label={whatsappMessageStatusLabels[status]} status={status} />
      </p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
