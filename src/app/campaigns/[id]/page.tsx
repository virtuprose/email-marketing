import {
  CampaignReviewSeverity,
  CampaignStatus,
  EmailDesignValidationStatus,
  Prisma,
  SendJobStatus
} from "@prisma/client";
import {
  ArrowLeft,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
  WandSparkles
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveCampaign,
  confirmCampaignLeadCompliance,
  pauseCampaignSending,
  rescheduleCampaignQueuedEmails,
  resumeCampaignSending,
  scheduleApprovedCampaign,
  selectCampaignEmailDesign,
  sendCampaignEmailDesignTest,
  uploadCampaignEmailDesign,
  removeCampaignEmailDesign,
  useDefaultCampaignEmailDesign,
  updateCampaignContent
} from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { objectiveLabels } from "@/lib/campaigns";
import { renderCustomEmailHtml } from "@/lib/email-designs";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { COMPLIANCE_SETTINGS_KEY, parseComplianceSettings } from "@/lib/settings";
import { ensureDefaultSendingAccount, renderEmailCopy } from "@/lib/sending";
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
  selectedEmailDesignTemplate: true,
  emailDesignTemplates: { orderBy: { createdAt: "asc" } },
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
  sendingAccount: { include: { limits: true } }
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
  const lockedEmailDesignStatuses: CampaignStatus[] = [
    CampaignStatus.SCHEDULED,
    CampaignStatus.SENDING,
    CampaignStatus.PAUSED,
    CampaignStatus.COMPLETED,
    CampaignStatus.ARCHIVED
  ];
  const canEditEmailDesign = !lockedEmailDesignStatuses.includes(campaign.status);
  const designPreviews = campaign.emailDesignTemplates.map((template) => ({
    template,
    html: renderEmailDesignPreview({
      template,
      campaign,
      lead: sampleLead,
      senderName: sendingAccounts[0]?.fromName || compliance.senderName || "Virtuprose",
      unsubscribeUrl: compliance.unsubscribeUrl || "https://virtuprose.com/unsubscribe"
    })
  }));

  return (
    <>
      <PageHeader
        eyebrow="Campaign Review"
        title={campaign.name}
        description={`${objectiveLabels[campaign.objective]} for ${campaign.offer.name}. Review the message, approve it, and start sending safely.`}
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
                    ? "Fix safety issues"
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
        <Summary label="People">{formatNumber(campaign._count.recipients)}</Summary>
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
          <EmailDesignPanel
            campaign={campaign}
            canEdit={canEditEmailDesign}
            designPreviews={designPreviews}
            sendingAccounts={sendingAccounts}
          />
          <SendMonitor latestJob={latestJob} recentMessages={recentMessages} />
        </main>

        <aside className="stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Send controls</h2>
                <p className="muted">
                  Starting creates sending jobs. Messages still follow limits and safety checks.
                </p>
              </div>
              <Send size={18} aria-hidden="true" />
            </div>
            <div className="panel-body stack">
              {canSchedule ? (
                <form action={scheduleApprovedCampaign} className="stack">
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <label className="field">
                    <span>Send from</span>
                    <select className="select" name="sendingAccountId">
                      {sendingAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} -{" "}
                          {account.dryRun ? "test mode" : sendingAccountStatusLabels[account.status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button" type="submit">
                    <Send size={16} aria-hidden="true" /> Start sending
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
                    <PlayCircle size={16} aria-hidden="true" /> Continue sending
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

              {activeJob ? <CampaignTimingEditor campaign={campaign} activeJob={activeJob} /> : null}
            </div>
          </section>

          <SafetyPanel
            campaignId={campaign.id}
            blockers={blockers.length}
            warnings={warnings.length}
            reviews={campaign.reviews}
          />
          <PreviewPanel preview={preview} />
          <AiPanel generation={latestGeneration} campaign={campaign} />

          <section className="alert">
            <ShieldAlert size={16} aria-hidden="true" /> Test mode is safest until your email account and
            inbox delivery are confirmed.
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
          <h2>People included</h2>
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
              <th>Contact status</th>
              <th>Where from?</th>
              <th>Why can we contact them?</th>
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
                  <td>{recipient.lead.source || <span className="muted">Needs info</span>}</td>
                  <td>{recipient.lead.legalBasis || <span className="muted">Needs info</span>}</td>
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

function EmailDesignPanel({
  campaign,
  canEdit,
  designPreviews,
  sendingAccounts
}: {
  campaign: CampaignDetail;
  canEdit: boolean;
  designPreviews: Array<{ template: CampaignDetail["emailDesignTemplates"][number]; html: string }>;
  sendingAccounts: Array<{ id: string; name: string; dryRun: boolean }>;
}) {
  const selectedTemplateId = campaign.selectedEmailDesignTemplateId;
  const uploadLimitReached = designPreviews.length >= 3;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Email design</h2>
          <p className="muted">
            Upload premium self-contained HTML designs, preview them, then choose one for this campaign.
          </p>
        </div>
        <Upload size={18} aria-hidden="true" />
      </div>
      <div className="panel-body stack">
        <div className="email-design-current">
          <div>
            <strong>{selectedTemplateId ? "Custom HTML selected" : "Default branded design"}</strong>
            <p className="muted">
              {selectedTemplateId
                ? "Queued emails will use the selected custom HTML snapshot."
                : "Emails use the built-in Virtuprose branded wrapper."}
            </p>
          </div>
          {selectedTemplateId ? (
            <form action={useDefaultCampaignEmailDesign}>
              <input type="hidden" name="campaignId" value={campaign.id} />
              <button className="secondary-button" type="submit" disabled={!canEdit}>
                Use default design
              </button>
            </form>
          ) : (
            <StatusBadge label="Active" status="PASS" />
          )}
        </div>

        {canEdit ? (
          <form
            action={uploadCampaignEmailDesign}
            className="email-design-upload"
            encType="multipart/form-data"
          >
            <input type="hidden" name="campaignId" value={campaign.id} />
            <label className="field">
              <span>Design name</span>
              <input className="input" name="name" placeholder="Premium real estate design" />
            </label>
            <label className="field">
              <span>HTML file</span>
              <input
                className="input"
                name="htmlFile"
                type="file"
                accept=".html,text/html"
                required
                disabled={uploadLimitReached}
              />
              <small>
                Upload up to 3 self-contained HTML files. Each file must include {"{{body_html}}"} and an
                unsubscribe link or {"{{unsubscribe_url}}"}.
              </small>
            </label>
            <button className="secondary-button" type="submit" disabled={uploadLimitReached}>
              <Upload size={16} aria-hidden="true" /> Upload design
            </button>
            {uploadLimitReached ? (
              <div className="alert">Remove one design before uploading another.</div>
            ) : null}
          </form>
        ) : (
          <div className="alert">Email designs are locked after sending has been scheduled.</div>
        )}

        {designPreviews.length ? (
          <div className="email-design-list">
            {designPreviews.map(({ template, html }) => (
              <article className="email-design-card" key={template.id}>
                <div className="email-design-card-head">
                  <div>
                    <h3>{template.name}</h3>
                    <p className="muted">Uploaded {formatDate(template.createdAt)}</p>
                  </div>
                  <div className="tag-list">
                    {template.selected ? <span className="tag">Selected</span> : null}
                    <StatusBadge
                      label={template.status === EmailDesignValidationStatus.VALID ? "Valid" : "Blocked"}
                      status={template.status === EmailDesignValidationStatus.VALID ? "PASS" : "BLOCK"}
                    />
                  </div>
                </div>

                {template.errors.length ? (
                  <div className="alert danger-alert">
                    <strong>Fix before sending</strong>
                    <ul className="compact-list">
                      {template.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {template.warnings.length ? (
                  <div className="alert">
                    <strong>Review warnings</strong>
                    <ul className="compact-list">
                      {template.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <details className="advanced-inline email-design-preview" open={template.selected}>
                  <summary>Preview desktop and mobile</summary>
                  <div className="email-preview-grid">
                    <EmailDesignFrame title={`${template.name} desktop preview`} html={html} mode="desktop" />
                    <EmailDesignFrame title={`${template.name} mobile preview`} html={html} mode="mobile" />
                  </div>
                </details>

                <div className="email-design-actions">
                  <form action={selectCampaignEmailDesign}>
                    <input type="hidden" name="campaignId" value={campaign.id} />
                    <input type="hidden" name="templateId" value={template.id} />
                    <button
                      className="secondary-button"
                      type="submit"
                      disabled={
                        !canEdit || template.selected || template.status !== EmailDesignValidationStatus.VALID
                      }
                    >
                      Select design
                    </button>
                  </form>

                  <form action={sendCampaignEmailDesignTest} className="email-design-test-form">
                    <input type="hidden" name="campaignId" value={campaign.id} />
                    <input type="hidden" name="templateId" value={template.id} />
                    <select className="select" name="sendingAccountId" aria-label="Test sending account">
                      {sendingAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} - {account.dryRun ? "test mode" : "live SMTP"}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      name="to"
                      type="email"
                      placeholder="you@example.com"
                      aria-label="Test recipient email"
                      required
                    />
                    <button
                      className="secondary-button"
                      type="submit"
                      disabled={
                        !sendingAccounts.length || template.status !== EmailDesignValidationStatus.VALID
                      }
                    >
                      Send test
                    </button>
                  </form>

                  <form action={removeCampaignEmailDesign}>
                    <input type="hidden" name="campaignId" value={campaign.id} />
                    <input type="hidden" name="templateId" value={template.id} />
                    <button className="danger-button" type="submit" disabled={!canEdit}>
                      <Trash2 size={16} aria-hidden="true" /> Remove
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            No custom designs uploaded. The default branded design will be used.
          </div>
        )}
      </div>
    </section>
  );
}

function EmailDesignFrame({
  title,
  html,
  mode
}: {
  title: string;
  html: string;
  mode: "desktop" | "mobile";
}) {
  return (
    <div className={`email-design-frame-shell email-design-frame-${mode}`}>
      <span>{mode === "desktop" ? "Desktop" : "Mobile"}</span>
      <iframe title={title} srcDoc={html} sandbox="" />
    </div>
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
          <h2>Sending progress</h2>
          <p className="muted">
            The assistant sends one message at a time and re-checks do-not-contact rules, state, and limits.
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
            <span>Send from</span>
            <span>{latestJob.sendingAccount.name}</span>
          </div>
          <div className="profile-row">
            <span>Mode</span>
            <span>{latestJob.sendingAccount.dryRun ? "Test mode" : "Live email"}</span>
          </div>
          {latestJob.lastError ? <div className="alert danger-alert">{latestJob.lastError}</div> : null}
        </div>
      ) : (
        <div className="panel-body">
          <div className="empty-state">
            No sending job yet. Approved campaigns can be started from the side panel.
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

function CampaignTimingEditor({
  campaign,
  activeJob
}: {
  campaign: CampaignDetail;
  activeJob: SendJobDetail;
}) {
  const defaultStartAt = formatDateTimeLocalKuwait(new Date(activeJob.updatedAt.getTime() + 5 * 60 * 1000));
  const spacingSeconds = activeJob.sendingAccount.limits?.minDelaySeconds ?? 30;
  return (
    <details className="advanced-inline campaign-timing-editor">
      <summary>Edit queued email timing</summary>
      <form action={rescheduleCampaignQueuedEmails} className="stack" style={{ marginTop: 12 }}>
        <input type="hidden" name="campaignId" value={campaign.id} />
        <div className="alert">
          This changes only emails that are still queued. Already-sent emails stay unchanged.
        </div>
        <label className="field">
          <span>Start remaining queued emails</span>
          <input
            className="input"
            name="startAt"
            type="datetime-local"
            defaultValue={defaultStartAt}
            required
          />
          <small>Kuwait time. Use this if you want queued emails to start later or restart now.</small>
        </label>
        <label className="field">
          <span>Spacing between recipients</span>
          <input
            className="input"
            name="spacingSeconds"
            type="number"
            min={5}
            max={3600}
            defaultValue={spacingSeconds}
            required
          />
          <small>The daily and per-minute safety limits still apply.</small>
        </label>
        <div className="campaign-step-timing">
          {campaign.steps.map((step) => (
            <label className="field" key={step.id}>
              <span>Step {step.stepOrder} delay days</span>
              <input type="hidden" name="stepId" value={step.id} />
              <input
                className="input"
                name="stepDelayDays"
                type="number"
                min={0}
                max={30}
                defaultValue={step.delayDays}
                required
              />
            </label>
          ))}
        </div>
        <button className="secondary-button" type="submit">
          Update queued timing
        </button>
      </form>
    </details>
  );
}

function SafetyPanel({
  campaignId,
  blockers,
  warnings,
  reviews
}: {
  campaignId: string;
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
              {review.key === "lead_compliance" && review.severity === CampaignReviewSeverity.BLOCK ? (
                <ConfirmLeadComplianceForm campaignId={campaignId} />
              ) : null}
            </div>
            <StatusBadge label={campaignReviewSeverityLabels[review.severity]} status={review.severity} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfirmLeadComplianceForm({ campaignId }: { campaignId: string }) {
  return (
    <form action={confirmCampaignLeadCompliance} className="compliance-override-form">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="alert compliance-override-note">
        Use this only when you can confirm these recipients came from a business lead source and the outreach
        is relevant. Suppressed, unsubscribed, bounced, and do-not-contact leads still cannot be bypassed.
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Lead source</span>
          <select className="select" name="source" defaultValue="LinkedIn Sales Navigator" required>
            <option value="LinkedIn Sales Navigator">LinkedIn Sales Navigator</option>
            <option value="Leads411">Leads411</option>
            <option value="Manual verified B2B list">Manual verified B2B list</option>
          </select>
        </label>
        <label className="field">
          <span>Country to apply where missing</span>
          <input className="input" name="country" defaultValue="Kuwait" required />
        </label>
      </div>
      <label className="field">
        <span>Legal basis / permission reason</span>
        <textarea
          className="textarea compact-textarea"
          name="legalBasis"
          required
          defaultValue="B2B legitimate interest for relevant business outreach. Source verified by owner before campaign approval."
        />
        <small>This fills only missing legal-basis fields for leads already selected in this campaign.</small>
      </label>
      <label className="field checkbox-field">
        <input type="checkbox" name="confirmation" required />
        <span>
          I confirm these leads are appropriate for this outreach and were sourced for business use.
        </span>
      </label>
      <button className="secondary-button" type="submit">
        Confirm source and recheck
      </button>
    </form>
  );
}

function formatDateTimeLocalKuwait(date: Date) {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
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

function renderEmailDesignPreview({
  template,
  campaign,
  lead,
  senderName,
  unsubscribeUrl
}: {
  template: CampaignDetail["emailDesignTemplates"][number];
  campaign: CampaignDetail;
  lead: { firstName: string | null; company: string | null; email: string } | undefined;
  senderName: string;
  unsubscribeUrl: string;
}) {
  const sampleLead = lead ?? {
    firstName: "there",
    company: "your company",
    email: "lead@example.com"
  };
  const firstStep = campaign.steps[0];
  if (!firstStep) return template.sanitizedHtml;

  const rendered = renderEmailCopy({
    subject: firstStep.subject,
    body: firstStep.body,
    lead: sampleLead,
    senderName,
    unsubscribeUrl
  });

  return renderCustomEmailHtml({
    designHtml: template.sanitizedHtml,
    account: { fromName: senderName },
    subject: rendered.subject,
    text: rendered.bodyText,
    lead: sampleLead,
    unsubscribeUrl
  });
}
