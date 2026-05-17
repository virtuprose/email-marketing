import { CampaignReviewSeverity, CampaignStatus, Prisma, SendJobStatus } from "@prisma/client";
import {
  ArrowLeft,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Send,
  ShieldAlert,
  WandSparkles
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveCampaign,
  pauseCampaignSending,
  resumeCampaignSending,
  scheduleApprovedCampaign,
  updateCampaignContent
} from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { objectiveLabels } from "@/lib/campaigns";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { COMPLIANCE_SETTINGS_KEY, parseComplianceSettings } from "@/lib/settings";
import { ensureDefaultSendingAccount } from "@/lib/sending";
import {
  campaignReviewSeverityLabels,
  campaignStatusLabels,
  emailMessageStatusLabels,
  leadStatusLabels,
  sendingAccountStatusLabels,
  sendJobStatusLabels
} from "@/lib/status";

export const dynamic = "force-dynamic";

type CampaignPageProps = {
  params: Promise<{ id: string }>;
};

const campaignDetailInclude = {
  offer: true,
  steps: { orderBy: { stepOrder: "asc" } },
  reviews: { orderBy: [{ severity: "asc" }, { createdAt: "asc" }] },
  aiGenerations: { orderBy: { createdAt: "desc" }, take: 1 },
  recipients: {
    include: { lead: { include: { tags: true } } },
    orderBy: { createdAt: "desc" },
    take: 25
  },
  _count: { select: { recipients: true } }
} satisfies Prisma.CampaignInclude;

const sendJobInclude = {
  sendingAccount: true
} satisfies Prisma.SendJobInclude;

const emailMessageInclude = {
  lead: true
} satisfies Prisma.EmailMessageInclude;

type CampaignDetail = Prisma.CampaignGetPayload<{ include: typeof campaignDetailInclude }>;
type SendJobDetail = Prisma.SendJobGetPayload<{ include: typeof sendJobInclude }>;
type EmailMessageDetail = Prisma.EmailMessageGetPayload<{ include: typeof emailMessageInclude }>;

export default async function CampaignDetailPage({ params }: CampaignPageProps) {
  const { id } = await params;
  await ensureDefaultSendingAccount();

  const [campaign, complianceSetting, sendingAccounts, sendJobs, recentMessages] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id },
      include: campaignDetailInclude
    }),
    prisma.setting.findUnique({ where: { key: COMPLIANCE_SETTINGS_KEY } }),
    prisma.sendingAccount.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.sendJob.findMany({
      where: { campaignId: id },
      include: sendJobInclude,
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.emailMessage.findMany({
      where: { campaignId: id },
      include: emailMessageInclude,
      orderBy: { queuedAt: "desc" },
      take: 20
    })
  ]);

  if (!campaign) notFound();

  const compliance = parseComplianceSettings(complianceSetting?.value);
  const latestGeneration = campaign.aiGenerations[0];
  const blockers = campaign.reviews.filter((review) => review.severity === CampaignReviewSeverity.BLOCK);
  const warnings = campaign.reviews.filter((review) => review.severity === CampaignReviewSeverity.WARNING);
  const sampleLead = campaign.recipients[0]?.lead;
  const preview = renderPreview(campaign.steps[0]?.body ?? "", sampleLead, compliance);
  const canApprove = blockers.length === 0 && campaign.status !== CampaignStatus.APPROVED;
  const latestJob = sendJobs[0];
  const activeJobStatuses: SendJobStatus[] = [
    SendJobStatus.QUEUED,
    SendJobStatus.RUNNING,
    SendJobStatus.PAUSED
  ];
  const activeJob = sendJobs.find((job) => activeJobStatuses.includes(job.status));
  const canSchedule = campaign.status === CampaignStatus.APPROVED && !activeJob && sendingAccounts.length > 0;
  const canPause = Boolean(activeJob && activeJob.status !== SendJobStatus.PAUSED);
  const canResume = activeJob?.status === SendJobStatus.PAUSED;

  return (
    <>
      <PageHeader
        eyebrow="Campaign Review"
        title={campaign.name}
        description={`${objectiveLabels[campaign.objective]} for ${campaign.offer.name}. Phase 3 schedules approved campaigns through a throttled queue.`}
        actions={
          <>
            <Link className="secondary-button" href="/campaigns">
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </Link>
            <form action={approveCampaign}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <button className="button" type="submit" disabled={!canApprove}>
                <CheckCircle2 size={16} aria-hidden="true" />
                {campaign.status === CampaignStatus.APPROVED
                  ? "Approved"
                  : blockers.length
                    ? "Resolve blockers"
                    : "Approve"}
              </button>
            </form>
          </>
        }
      />

      <section className="grid grid-4" aria-label="Campaign summary">
        <Summary label="Status">
          <StatusBadge label={campaignStatusLabels[campaign.status]} status={campaign.status} />
        </Summary>
        <Summary label="Recipients">{formatNumber(campaign._count.recipients)}</Summary>
        <Summary label="AI confidence">
          {campaign.aiConfidence ? `${campaign.aiConfidence}%` : "Not set"}
        </Summary>
        <Summary label="Send status">
          {latestJob ? (
            <StatusBadge label={sendJobStatusLabels[latestJob.status]} status={latestJob.status} />
          ) : (
            <span className="muted">Not scheduled</span>
          )}
        </Summary>
      </section>

      <div className="builder-layout" style={{ marginTop: 16 }}>
        <main className="stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Email sequence</h2>
                <p className="muted">Edit the AI draft, then save to re-run the safety checklist.</p>
              </div>
            </div>
            <div className="panel-body">
              <form action={updateCampaignContent} className="stack">
                <input type="hidden" name="campaignId" value={campaign.id} />
                {campaign.steps.map((step) => (
                  <article className="sequence-step" key={step.id}>
                    <div className="profile-row">
                      <span>Step {step.stepOrder}</span>
                      <span>{step.delayDays === 0 ? "Initial email" : `${step.delayDays} days later`}</span>
                    </div>
                    <input type="hidden" name="stepId" value={step.id} />
                    <div className="form-grid">
                      <label className="field">
                        <span>Delay days</span>
                        <input
                          className="input"
                          name="delayDays"
                          type="number"
                          min={0}
                          max={21}
                          defaultValue={step.delayDays}
                        />
                      </label>
                      <label className="field">
                        <span>Subject</span>
                        <input className="input" name="subject" required defaultValue={step.subject} />
                      </label>
                    </div>
                    <label className="field">
                      <span>Body</span>
                      <textarea
                        className="textarea email-editor"
                        name="body"
                        required
                        defaultValue={step.body}
                      />
                    </label>
                  </article>
                ))}

                <button className="button" type="submit">
                  Save and review
                </button>
              </form>
            </div>
          </section>

          <RecipientsPanel campaign={campaign} />
          <SendMonitor latestJob={latestJob} recentMessages={recentMessages} />
        </main>

        <aside className="stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Send controls</h2>
                <p className="muted">
                  Scheduling creates queue jobs. The HTTP request never sends the campaign.
                </p>
              </div>
              <Send size={18} aria-hidden="true" />
            </div>
            <div className="panel-body stack">
              {canSchedule ? (
                <form action={scheduleApprovedCampaign} className="stack">
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <label className="field">
                    <span>Sending account</span>
                    <select className="select" name="sendingAccountId">
                      {sendingAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} -{" "}
                          {account.dryRun ? "dry-run" : sendingAccountStatusLabels[account.status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button" type="submit">
                    <Send size={16} aria-hidden="true" /> Schedule send
                  </button>
                </form>
              ) : null}

              {canPause ? (
                <form action={pauseCampaignSending}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <button className="danger-button" type="submit">
                    <PauseCircle size={16} aria-hidden="true" /> Pause sending
                  </button>
                </form>
              ) : null}

              {canResume ? (
                <form action={resumeCampaignSending}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <button className="button" type="submit">
                    <PlayCircle size={16} aria-hidden="true" /> Resume queue
                  </button>
                </form>
              ) : null}

              {!canSchedule && !canPause && !canResume ? (
                <div className="alert">
                  {campaign.status === CampaignStatus.APPROVED
                    ? "No active sending account is available."
                    : "Send controls appear after the campaign is approved or scheduled."}
                </div>
              ) : null}
            </div>
          </section>

          <SafetyPanel blockers={blockers.length} warnings={warnings.length} reviews={campaign.reviews} />
          <PreviewPanel preview={preview} />
          <AiPanel generation={latestGeneration} campaign={campaign} />

          <section className="alert">
            <ShieldAlert size={16} aria-hidden="true" /> Phase 3 sends through the queue and uses dry-run
            unless SMTP is configured.
          </section>
        </aside>
      </div>
    </>
  );
}

function RecipientsPanel({ campaign }: { campaign: CampaignDetail }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Recipients attached</h2>
          <p className="muted">
            Showing first {formatNumber(campaign.recipients.length)} of{" "}
            {formatNumber(campaign._count.recipients)} recipients.
          </p>
        </div>
      </div>
      <div className="table-wrap embedded-table" aria-label="Campaign recipients">
        <table>
          <thead>
            <tr>
              <th>Lead</th>
              <th>Status</th>
              <th>Source</th>
              <th>Legal basis</th>
            </tr>
          </thead>
          <tbody>
            {campaign.recipients.length ? (
              campaign.recipients.map((recipient) => (
                <tr key={recipient.id}>
                  <td>
                    {recipient.lead.firstName || recipient.lead.company || recipient.lead.email}
                    <br />
                    <span className="muted">{recipient.lead.email}</span>
                  </td>
                  <td>
                    <StatusBadge
                      label={leadStatusLabels[recipient.lead.status]}
                      status={recipient.lead.status}
                    />
                  </td>
                  <td>{recipient.lead.source || <span className="muted">Missing</span>}</td>
                  <td>{recipient.lead.legalBasis || <span className="muted">Missing</span>}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">No recipients were attached to this campaign.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SendMonitor({
  latestJob,
  recentMessages
}: {
  latestJob: SendJobDetail | undefined;
  recentMessages: EmailMessageDetail[];
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Send monitor</h2>
          <p className="muted">
            Queue jobs send one message at a time and re-check suppression, state, and limits.
          </p>
        </div>
      </div>
      {latestJob ? (
        <div className="panel-body stack">
          <div className="grid grid-4">
            <MiniMetric label="Queued" value={latestJob.queuedMessages} />
            <MiniMetric label="Sent" value={latestJob.sentMessages} />
            <MiniMetric label="Skipped" value={latestJob.skippedMessages} />
            <MiniMetric label="Failed" value={latestJob.failedMessages} />
          </div>
          <div className="profile-row">
            <span>Sending account</span>
            <span>{latestJob.sendingAccount.name}</span>
          </div>
          <div className="profile-row">
            <span>Mode</span>
            <span>{latestJob.sendingAccount.dryRun ? "Dry-run" : "SMTP"}</span>
          </div>
          {latestJob.lastError ? <div className="alert danger-alert">{latestJob.lastError}</div> : null}
        </div>
      ) : (
        <div className="panel-body">
          <div className="empty-state">
            No send job yet. Approved campaigns can be scheduled from the side panel.
          </div>
        </div>
      )}

      <div className="table-wrap embedded-table" aria-label="Recent email messages">
        <table>
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Status</th>
              <th>Queued</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>
            {recentMessages.length ? (
              recentMessages.map((message) => (
                <tr key={message.id}>
                  <td>
                    {message.lead.firstName || message.lead.company || message.recipientEmail}
                    <br />
                    <span className="muted">{message.recipientEmail}</span>
                  </td>
                  <td>
                    <StatusBadge label={emailMessageStatusLabels[message.status]} status={message.status} />
                  </td>
                  <td>{formatDate(message.queuedAt)}</td>
                  <td>
                    {message.sentAt ? formatDate(message.sentAt) : <span className="muted">Not sent</span>}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">No message records yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SafetyPanel({
  blockers,
  warnings,
  reviews
}: {
  blockers: number;
  warnings: number;
  reviews: CampaignDetail["reviews"];
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Safety checklist</h2>
          <p className="muted">
            {blockers
              ? `${blockers} blocker(s) must be fixed before approval.`
              : warnings
                ? `${warnings} warning(s) remain.`
                : "No blockers detected."}
          </p>
        </div>
      </div>
      <div className="panel-body stack">
        {reviews.map((review) => (
          <div className="checklist-item" key={review.id}>
            <div>
              <strong>{review.label}</strong>
              <p>{review.message}</p>
            </div>
            <StatusBadge label={campaignReviewSeverityLabels[review.severity]} status={review.severity} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PreviewPanel({ preview }: { preview: string }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Preview</h2>
          <p className="muted">Rendered with the first attached lead.</p>
        </div>
      </div>
      <div className="panel-body">
        <pre className="email-preview">{preview || "No email body available."}</pre>
      </div>
    </section>
  );
}

function AiPanel({
  generation,
  campaign
}: {
  generation: CampaignDetail["aiGenerations"][number] | undefined;
  campaign: CampaignDetail;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>AI generation</h2>
          <p className="muted">
            {generation ? `${generation.provider} / ${generation.model}` : "No generation record found."}
          </p>
        </div>
        <WandSparkles size={18} aria-hidden="true" />
      </div>
      <div className="panel-body stack">
        <div className="profile-row">
          <span>Generated</span>
          <span>{generation ? formatDate(generation.createdAt) : "Missing"}</span>
        </div>
        <div className="profile-row">
          <span>Confidence</span>
          <span>{campaign.aiConfidence}%</span>
        </div>
        <div>
          <h3>Risk flags</h3>
          <div className="tag-list" style={{ marginTop: 8 }}>
            {campaign.riskFlags.length ? (
              campaign.riskFlags.map((flag) => (
                <span className="tag" key={flag}>
                  {flag}
                </span>
              ))
            ) : (
              <span className="muted">None</span>
            )}
          </div>
        </div>
        <div>
          <h3>Claims used</h3>
          <div className="tag-list" style={{ marginTop: 8 }}>
            {campaign.claimsUsed.length ? (
              campaign.claimsUsed.map((claim) => (
                <span className="tag" key={claim}>
                  {claim}
                </span>
              ))
            ) : (
              <span className="muted">No proof claims used</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value metric-inline">{children}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric compact-metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{formatNumber(value)}</p>
    </div>
  );
}

function renderPreview(
  copy: string,
  lead: { firstName: string | null; company: string | null } | undefined,
  compliance: { senderName?: string; unsubscribeUrl?: string }
) {
  return copy
    .replaceAll("{{first_name}}", lead?.firstName || "there")
    .replaceAll("{{company}}", lead?.company || "your company")
    .replaceAll("{{sender_name}}", compliance.senderName || "Virtuprose")
    .replaceAll("{{unsubscribe_url}}", compliance.unsubscribeUrl || "https://virtuprose.com/unsubscribe");
}
