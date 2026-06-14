import {
  CampaignRecipientStatus,
  CampaignStatus,
  ConversationDirection,
  EmailDesignValidationStatus,
  EmailEventType,
  EmailMessageStatus,
  LeadEventType,
  LeadStatus,
  MessageChannel,
  SendJobStatus,
  SendingAccountStatus,
  SuppressionReason,
  type Lead,
  type SendingAccount,
  type SendingLimit
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import {
  detectConversationLanguage,
  ensureConversationForLead,
  recordConversationMessage
} from "@/lib/conversations";
import { renderCustomEmailHtml } from "@/lib/email-designs";
import { emailQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { COMPLIANCE_SETTINGS_KEY, parseComplianceSettings } from "@/lib/settings";

export const DEFAULT_SENDING_ACCOUNT_NAME = "Virtuprose SMTP";
export const SENDING_CONTROL_SETTINGS_KEY = "sending_control";

export type SendingControlSettings = {
  killSwitch?: boolean;
};

export type SendingAccountForm = {
  name: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  host?: string;
  port: number;
  secure: boolean;
  username?: string;
  dryRun: boolean;
  dailyCap: number;
  perMinuteCap: number;
  perDomainDailyCap: number;
  minDelaySeconds: number;
};

const blockedLeadStatuses: LeadStatus[] = [
  LeadStatus.SUPPRESSED,
  LeadStatus.UNSUBSCRIBED,
  LeadStatus.BOUNCED,
  LeadStatus.DO_NOT_CONTACT,
  LeadStatus.LOST
];
const EMAIL_LOGO_CID = "virtuprose-email-logo";
const EMAIL_LOGO_PATH = path.join(process.cwd(), "public", "brand", "virtuprose-email-logo.png");

export function parseSendingControl(value: unknown): SendingControlSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    killSwitch: typeof record.killSwitch === "boolean" ? record.killSwitch : undefined
  };
}

export function smtpPasswordConfigured() {
  return Boolean(process.env.SMTP_PASS || process.env.SMTP_PASSWORD);
}

export function appBaseUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function sendingAccountStatus(input: {
  dryRun: boolean;
  host?: string | null;
  username?: string | null;
}) {
  if (input.dryRun) return SendingAccountStatus.ACTIVE;
  if (input.host && input.username && smtpPasswordConfigured()) return SendingAccountStatus.ACTIVE;
  return SendingAccountStatus.NOT_CONFIGURED;
}

export async function ensureDefaultSendingAccount() {
  const existing = await prisma.sendingAccount.findFirst({
    include: { limits: true },
    orderBy: { createdAt: "asc" }
  });

  if (existing) return existing;

  const compliance = parseComplianceSettings(
    (await prisma.setting.findUnique({ where: { key: COMPLIANCE_SETTINGS_KEY } }))?.value
  );

  return prisma.sendingAccount.create({
    data: {
      name: DEFAULT_SENDING_ACCOUNT_NAME,
      fromName: compliance.senderName || "Virtuprose",
      fromEmail: compliance.senderEmail || "hello@virtuprose.com",
      replyTo: compliance.senderEmail || null,
      dryRun: true,
      status: SendingAccountStatus.ACTIVE,
      limits: {
        create: conservativeDefaultLimits()
      }
    },
    include: { limits: true }
  });
}

export function conservativeDefaultLimits() {
  return {
    dailyCap: 25,
    perMinuteCap: 2,
    perDomainDailyCap: 10,
    minDelaySeconds: 30
  };
}

export function recipientDomain(email: string) {
  return email.split("@")[1]?.toLowerCase() || "unknown";
}

export function renderEmailCopy({
  subject,
  body,
  lead,
  senderName,
  unsubscribeUrl,
  personalization
}: {
  subject: string;
  body: string;
  lead: Pick<Lead, "firstName" | "company" | "email" | "website">;
  senderName: string;
  unsubscribeUrl: string;
  personalization?: unknown;
}) {
  const replacements = {
    "{{first_name}}": lead.firstName || "there",
    "{{company}}": lead.company || "your company",
    "{{website}}": lead.website || "",
    "{{sender_name}}": senderName,
    "{{unsubscribe_url}}": unsubscribeUrl,
    ...personalizationReplacements(personalization)
  };

  let renderedSubject = subject;
  let renderedBody = body;
  for (const [token, value] of Object.entries(replacements)) {
    renderedSubject = renderedSubject.replaceAll(token, value);
    renderedBody = renderedBody.replaceAll(token, value);
  }

  return {
    subject: renderedSubject,
    bodyText: renderedBody
  };
}

function personalizationReplacements(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const allowed = [
    "audit_pain_point",
    "audit_evidence",
    "recommended_improvement",
    "mobile_app_signal",
    "service_name",
    "audit_email_subject",
    "audit_email_body"
  ];
  const replacements: Record<string, string> = {};

  for (const key of allowed) {
    const replacement = String(record[key] ?? "").trim();
    replacements[`{{${key}}}`] = replacement;
  }

  return replacements;
}

export async function scheduleCampaignSend(campaignId: string, sendingAccountId: string) {
  const queue = emailQueue();
  const messagesToQueue: Array<{ id: string; delayMs: number }> = [];
  const now = new Date();

  const sendJobId = await prisma.$transaction(async (tx) => {
    const control = parseSendingControl(
      (await tx.setting.findUnique({ where: { key: SENDING_CONTROL_SETTINGS_KEY } }))?.value
    );
    if (control.killSwitch) {
      throw new Error("Global kill switch is enabled. Turn it off before scheduling sends.");
    }

    const account = await tx.sendingAccount.findUnique({
      where: { id: sendingAccountId },
      include: { limits: true }
    });
    if (!account) throw new Error("Sending account not found.");
    if (account.status !== SendingAccountStatus.ACTIVE) {
      throw new Error("Sending account is not active.");
    }

    const campaign = await tx.campaign.findUnique({
      where: { id: campaignId },
      include: {
        recipients: { include: { lead: true }, orderBy: { createdAt: "asc" } },
        steps: { orderBy: { stepOrder: "asc" } },
        selectedEmailDesignTemplate: true
      }
    });
    if (!campaign) throw new Error("Campaign not found.");
    if (campaign.status !== CampaignStatus.APPROVED) {
      throw new Error("Only approved campaigns can be scheduled.");
    }
    if (!campaign.recipients.length || !campaign.steps.length) {
      throw new Error("Campaign needs recipients and email steps before scheduling.");
    }
    if (
      campaign.selectedEmailDesignTemplate &&
      (!campaign.selectedEmailDesignTemplate.active ||
        campaign.selectedEmailDesignTemplate.status !== EmailDesignValidationStatus.VALID)
    ) {
      throw new Error(
        "Selected email design is inactive or has blockers. Choose a valid design before scheduling."
      );
    }

    const existingActiveJob = await tx.sendJob.findFirst({
      where: {
        campaignId,
        status: { in: [SendJobStatus.QUEUED, SendJobStatus.RUNNING, SendJobStatus.PAUSED] }
      }
    });
    if (existingActiveJob) return existingActiveJob.id;

    const sendJob = await tx.sendJob.create({
      data: {
        campaignId,
        sendingAccountId,
        status: SendJobStatus.QUEUED,
        totalRecipients: campaign.recipients.length
      }
    });

    let queuedMessages = 0;
    let skippedMessages = 0;

    for (const recipient of campaign.recipients) {
      await tx.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: CampaignRecipientStatus.QUEUED }
      });

      for (const step of campaign.steps) {
        const token = await tx.unsubscribeToken.create({
          data: {
            token: randomUUID(),
            leadId: recipient.lead.id,
            campaignId,
            email: recipient.lead.email
          }
        });
        const unsubscribeUrl = `${appBaseUrl()}/unsubscribe/${token.token}`;
        const rendered = renderEmailCopy({
          subject: step.subject,
          body: step.body,
          lead: recipient.lead,
          senderName: account.fromName,
          unsubscribeUrl,
          personalization: recipient.personalization
        });
        const renderedHtml = campaign.selectedEmailDesignTemplate
          ? renderCustomEmailHtml({
              designHtml: campaign.selectedEmailDesignTemplate.sanitizedHtml,
              account,
              subject: rendered.subject,
              text: rendered.bodyText,
              lead: recipient.lead,
              unsubscribeUrl
            })
          : null;
        const queuedAt = new Date(now.getTime() + step.delayDays * 24 * 60 * 60 * 1000);
        const shouldSkip = Boolean(recipient.lead.deletedAt) || blockedLeadStatuses.includes(recipient.lead.status);
        const message = await tx.emailMessage.create({
          data: {
            sendJobId: sendJob.id,
            campaignId,
            campaignRecipientId: recipient.id,
            campaignStepId: step.id,
            leadId: recipient.lead.id,
            sendingAccountId,
            status: shouldSkip ? EmailMessageStatus.SKIPPED : EmailMessageStatus.QUEUED,
            recipientEmail: recipient.lead.email,
            recipientDomain: recipientDomain(recipient.lead.email),
            subject: rendered.subject,
            bodyText: rendered.bodyText,
            bodyHtml: renderedHtml,
            unsubscribeUrl,
            emailDesignTemplateId: campaign.selectedEmailDesignTemplate?.id,
            queuedAt,
            skippedAt: shouldSkip ? now : null,
            error: shouldSkip ? "Lead is no longer contactable." : null
          }
        });

        await tx.emailEvent.create({
          data: {
            type: shouldSkip ? EmailEventType.SKIPPED : EmailEventType.QUEUED,
            messageId: message.id,
            campaignId,
            leadId: recipient.lead.id,
            metadata: {
              stepOrder: step.stepOrder,
              queuedAt: queuedAt.toISOString(),
              reason: recipient.lead.deletedAt ? "lead_deleted" : shouldSkip ? "blocked_lead_status" : "scheduled"
            }
          }
        });

        if (shouldSkip) {
          skippedMessages += 1;
        } else {
          queuedMessages += 1;
          messagesToQueue.push({
            id: message.id,
            delayMs: Math.max(0, queuedAt.getTime() - now.getTime())
          });
        }
      }
    }

    await tx.sendJob.update({
      where: { id: sendJob.id },
      data: {
        queuedMessages,
        skippedMessages
      }
    });

    await tx.campaign.update({
      where: { id: campaignId },
      data: { status: queuedMessages ? CampaignStatus.SCHEDULED : CampaignStatus.COMPLETED }
    });

    await tx.auditLog.create({
      data: {
        action: "campaign.scheduled",
        entityType: "campaign",
        entityId: campaignId,
        metadata: {
          sendJobId: sendJob.id,
          queuedMessages,
          skippedMessages,
          dryRun: account.dryRun
        }
      }
    });

    return sendJob.id;
  });

  for (const message of messagesToQueue) {
    await queue.add("email.send", { messageId: message.id }, { delay: message.delayMs });
  }

  await queue.close();
  return sendJobId;
}

export async function processEmailMessage(messageId: string) {
  const message = await prisma.emailMessage.findUnique({
    where: { id: messageId },
    include: {
      lead: true,
      campaign: true,
      sendJob: true,
      sendingAccount: { include: { limits: true } }
    }
  });

  if (!message || message.status !== EmailMessageStatus.QUEUED) {
    return { ok: true, skipped: true, reason: "not_queued" };
  }

  const now = new Date();
  if (message.queuedAt > now) {
    await requeueMessage(message.id, message.queuedAt.getTime() - now.getTime());
    return { ok: true, requeued: true, reason: "not_due" };
  }

  const control = parseSendingControl(
    (await prisma.setting.findUnique({ where: { key: SENDING_CONTROL_SETTINGS_KEY } }))?.value
  );
  if (
    control.killSwitch ||
    message.campaign.status === CampaignStatus.PAUSED ||
    message.sendJob.status === SendJobStatus.PAUSED
  ) {
    await requeueMessage(message.id, 60_000);
    return { ok: true, paused: true };
  }

  if (message.sendingAccount.status !== SendingAccountStatus.ACTIVE) {
    await failMessage(message.id, "Sending account is not active.");
    return { ok: false, failed: true };
  }

  const suppression = await prisma.suppressionEntry.findUnique({ where: { email: message.lead.email } });
  if (message.lead.deletedAt || blockedLeadStatuses.includes(message.lead.status) || suppression) {
    await markMessageSkipped(
      message.id,
      message.lead.deletedAt
        ? "Lead was removed from active outreach."
        : "Lead is suppressed, unsubscribed, bounced, or marked do-not-contact."
    );
    return { ok: true, skipped: true, reason: message.lead.deletedAt ? "deleted_lead" : "suppressed" };
  }

  const rateLimit = await checkSendingLimits(
    message.sendingAccount,
    message.sendingAccount.limits,
    message.recipientDomain
  );
  if (!rateLimit.allowed) {
    await prisma.emailEvent.create({
      data: {
        type: EmailEventType.RATE_LIMITED,
        messageId: message.id,
        campaignId: message.campaignId,
        leadId: message.leadId,
        metadata: { reason: rateLimit.reason }
      }
    });
    await prisma.emailMessage.update({
      where: { id: message.id },
      data: { error: rateLimit.reason, queuedAt: new Date(Date.now() + rateLimit.retryAfterMs) }
    });
    await requeueMessage(message.id, rateLimit.retryAfterMs);
    return { ok: true, rateLimited: true, reason: rateLimit.reason };
  }

  await prisma.emailMessage.update({
    where: { id: message.id },
    data: { status: EmailMessageStatus.SENDING, startedAt: now }
  });
  await prisma.campaign.update({
    where: { id: message.campaignId },
    data: { status: CampaignStatus.SENDING }
  });
  await prisma.sendJob.update({
    where: { id: message.sendJobId },
    data: { status: SendJobStatus.RUNNING, startedAt: message.sendJob.startedAt ?? now }
  });

  try {
    const result = await sendEmail({
      account: message.sendingAccount,
      to: message.recipientEmail,
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml || undefined,
      unsubscribeUrl: message.unsubscribeUrl || undefined
    });

    await prisma.$transaction(async (tx) => {
      await tx.emailMessage.update({
        where: { id: message.id },
        data: {
          status: EmailMessageStatus.SENT,
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          messageIdHeader: result.messageId,
          error: null
        }
      });
      await tx.emailEvent.create({
        data: {
          type: EmailEventType.SENT,
          messageId: message.id,
          campaignId: message.campaignId,
          leadId: message.leadId,
          metadata: { dryRun: result.dryRun }
        }
      });
      const language = detectConversationLanguage(message.bodyText);
      const conversation = await ensureConversationForLead({
        tx,
        leadId: message.leadId,
        channel: MessageChannel.EMAIL,
        externalContactId: message.recipientEmail,
        language
      });
      await recordConversationMessage({
        tx,
        conversationId: conversation.id,
        leadId: message.leadId,
        channel: MessageChannel.EMAIL,
        direction: ConversationDirection.OUTBOUND,
        bodyText: `${message.subject}\n${message.bodyText}`,
        language,
        providerMessageId: result.providerMessageId,
        emailMessageId: message.id
      });
      const contactedFromStatuses: LeadStatus[] = [LeadStatus.NEW, LeadStatus.VALIDATED, LeadStatus.QUEUED];
      await tx.lead.update({
        where: { id: message.leadId },
        data: {
          status: contactedFromStatuses.includes(message.lead.status)
            ? LeadStatus.CONTACTED
            : message.lead.status,
          lastContactedAt: new Date()
        }
      });
      await tx.campaignRecipient.update({
        where: { id: message.campaignRecipientId },
        data: { status: CampaignRecipientStatus.SENT }
      });
    });

    await refreshSendJobProgress(message.sendJobId);
    return { ok: true, sent: true, dryRun: result.dryRun };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown send failure.";
    await failMessage(message.id, messageText);

    if (/auth|login|credential|password/i.test(messageText)) {
      await prisma.sendingAccount.update({
        where: { id: message.sendingAccountId },
        data: { status: SendingAccountStatus.AUTH_FAILED, lastError: messageText }
      });
      await pauseSendJob(message.sendJobId, `SMTP authentication failed: ${messageText}`);
    }

    return { ok: false, failed: true, error: messageText };
  }
}

export async function unsubscribeByToken(token: string) {
  const unsubscribeToken = await prisma.unsubscribeToken.findUnique({
    where: { token },
    include: { lead: true }
  });

  if (!unsubscribeToken) return { status: "missing" as const };

  if (unsubscribeToken.usedAt) {
    return { status: "already_used" as const, email: unsubscribeToken.email };
  }

  const queuedMessages = await prisma.emailMessage.findMany({
    where: {
      leadId: unsubscribeToken.leadId,
      campaignId: unsubscribeToken.campaignId ?? undefined,
      status: EmailMessageStatus.QUEUED
    },
    select: { id: true, sendJobId: true, campaignId: true, leadId: true }
  });
  const affectedSendJobIds = Array.from(new Set(queuedMessages.map((message) => message.sendJobId)));

  await prisma.$transaction(async (tx) => {
    await tx.unsubscribeToken.update({
      where: { id: unsubscribeToken.id },
      data: { usedAt: new Date() }
    });
    await tx.suppressionEntry.upsert({
      where: { email: unsubscribeToken.email },
      update: {
        reason: SuppressionReason.UNSUBSCRIBED,
        source: "unsubscribe_link",
        notes: "Unsubscribed through Phase 3 unsubscribe link."
      },
      create: {
        email: unsubscribeToken.email,
        reason: SuppressionReason.UNSUBSCRIBED,
        source: "unsubscribe_link",
        notes: "Unsubscribed through Phase 3 unsubscribe link."
      }
    });
    await tx.lead.update({
      where: { id: unsubscribeToken.leadId },
      data: { status: LeadStatus.UNSUBSCRIBED }
    });
    await tx.leadEvent.create({
      data: {
        leadId: unsubscribeToken.leadId,
        type: LeadEventType.SUPPRESSED,
        message: "Lead unsubscribed through email link.",
        metadata: { campaignId: unsubscribeToken.campaignId, tokenId: unsubscribeToken.id }
      }
    });
    await tx.emailEvent.create({
      data: {
        type: EmailEventType.UNSUBSCRIBED,
        campaignId: unsubscribeToken.campaignId,
        leadId: unsubscribeToken.leadId,
        metadata: { email: unsubscribeToken.email }
      }
    });
    await tx.emailMessage.updateMany({
      where: {
        leadId: unsubscribeToken.leadId,
        campaignId: unsubscribeToken.campaignId ?? undefined,
        status: EmailMessageStatus.QUEUED
      },
      data: {
        status: EmailMessageStatus.SKIPPED,
        skippedAt: new Date(),
        error: "Lead unsubscribed before this message was sent."
      }
    });
    if (queuedMessages.length) {
      await tx.emailEvent.createMany({
        data: queuedMessages.map((message) => ({
          type: EmailEventType.SKIPPED,
          messageId: message.id,
          campaignId: message.campaignId,
          leadId: message.leadId,
          metadata: { reason: "lead_unsubscribed" }
        }))
      });
    }
  });

  for (const sendJobId of affectedSendJobIds) {
    await refreshSendJobProgress(sendJobId);
  }

  return { status: "unsubscribed" as const, email: unsubscribeToken.email };
}

export async function sendTestEmail({ account, to }: { account: SendingAccount; to: string }) {
  const result = await sendEmail({
    account,
    to,
    subject: "Virtuprose sending test",
    text: [
      "This is a controlled sending test from the Virtuprose AI Email Sales Agent.",
      "",
      account.dryRun
        ? "Dry-run mode is active, so no external email was sent."
        : "SMTP mode is active. If you received this, credentials and provider acceptance are working."
    ].join("\n")
  });

  await prisma.emailEvent.create({
    data: {
      type: EmailEventType.TEST_SENT,
      metadata: { to, dryRun: result.dryRun, providerMessageId: result.providerMessageId }
    }
  });
  await prisma.sendingAccount.update({
    where: { id: account.id },
    data: { lastTestAt: new Date(), lastError: null }
  });

  return result;
}

export async function sendDirectEmail({
  account,
  to,
  subject,
  text
}: {
  account: SendingAccount;
  to: string;
  subject: string;
  text: string;
}) {
  return sendEmail({ account, to, subject, text });
}

export async function sendEmailDesignTest({
  account,
  to,
  subject,
  text,
  html,
  unsubscribeUrl
}: {
  account: SendingAccount;
  to: string;
  subject: string;
  text: string;
  html?: string;
  unsubscribeUrl?: string;
}) {
  const result = await sendEmail({ account, to, subject, text, html, unsubscribeUrl });

  await prisma.emailEvent.create({
    data: {
      type: EmailEventType.TEST_SENT,
      metadata: {
        to,
        dryRun: result.dryRun,
        providerMessageId: result.providerMessageId,
        customHtml: Boolean(html)
      }
    }
  });
  await prisma.sendingAccount.update({
    where: { id: account.id },
    data: { lastTestAt: new Date(), lastError: null }
  });

  return result;
}

async function sendEmail({
  account,
  to,
  subject,
  text,
  html,
  unsubscribeUrl
}: {
  account: SendingAccount;
  to: string;
  subject: string;
  text: string;
  html?: string;
  unsubscribeUrl?: string;
}) {
  if (account.dryRun) {
    return {
      dryRun: true,
      providerMessageId: `dry-run-${randomUUID()}`,
      messageId: `<dry-run-${randomUUID()}@virtuprose.local>`
    };
  }

  if (!account.host || !account.username || !smtpPasswordConfigured()) {
    throw new Error("SMTP host, username, and password are required when dry-run mode is off.");
  }

  const transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: {
      user: account.username,
      pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD
    }
  });

  const info = await transporter.sendMail({
    from: `"${account.fromName}" <${account.fromEmail}>`,
    to,
    replyTo: account.replyTo || account.fromEmail,
    subject,
    text,
    html: html || renderBrandedEmailHtml({ account, subject, text }),
    headers: unsubscribeUrl
      ? {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }
      : undefined,
    attachments: emailLogoAttachments()
  });

  return {
    dryRun: false,
    providerMessageId: info.messageId || `smtp-${randomUUID()}`,
    messageId: info.messageId || `<smtp-${randomUUID()}@${recipientDomain(account.fromEmail)}>`
  };
}

function emailLogoAttachments() {
  if (!existsSync(EMAIL_LOGO_PATH)) return [];
  return [
    {
      filename: "virtuprose-email-logo.png",
      path: EMAIL_LOGO_PATH,
      cid: EMAIL_LOGO_CID,
      contentType: "image/png"
    }
  ];
}

function renderBrandedEmailHtml({
  account,
  subject,
  text
}: {
  account: SendingAccount;
  subject: string;
  text: string;
}) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;color:#102225;font-size:15px;line-height:1.6;">${linkify(escapeHtml(paragraph)).replace(/\n/g, "<br>")}</p>`
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f8f8;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8f8;margin:0;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e3e8e8;border-radius:12px;">
            <tr>
              <td style="padding:28px 28px 10px;">
                <img src="cid:${EMAIL_LOGO_CID}" width="64" height="64" alt="${escapeHtml(account.fromName)}" style="display:block;border:0;outline:none;text-decoration:none;width:64px;height:64px;">
              </td>
            </tr>
            <tr>
              <td style="padding:10px 28px 8px;">
                ${paragraphs}
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 28px;color:#667579;font-size:12px;line-height:1.5;">
                ${escapeHtml(account.fromName)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function linkify(value: string) {
  return value.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const cleanUrl = url.replace(/[),.;]+$/, "");
    const suffix = url.slice(cleanUrl.length);
    return `<a href="${cleanUrl}" style="color:#00aeb7;text-decoration:underline;">${cleanUrl}</a>${suffix}`;
  });
}

async function checkSendingLimits(account: SendingAccount, limits: SendingLimit | null, domain: string) {
  const now = new Date();
  const minuteAgo = new Date(now.getTime() - 60_000);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const effectiveLimits = limits ?? conservativeDefaultLimits();
  const [sentToday, sentThisMinute, sentToDomainToday] = await Promise.all([
    prisma.emailMessage.count({
      where: { sendingAccountId: account.id, status: EmailMessageStatus.SENT, sentAt: { gte: dayStart } }
    }),
    prisma.emailMessage.count({
      where: { sendingAccountId: account.id, status: EmailMessageStatus.SENT, sentAt: { gte: minuteAgo } }
    }),
    prisma.emailMessage.count({
      where: {
        sendingAccountId: account.id,
        recipientDomain: domain,
        status: EmailMessageStatus.SENT,
        sentAt: { gte: dayStart }
      }
    })
  ]);

  if (sentToday >= effectiveLimits.dailyCap) {
    return { allowed: false, reason: "Daily sending cap reached.", retryAfterMs: 60 * 60 * 1000 };
  }
  if (sentThisMinute >= effectiveLimits.perMinuteCap) {
    return { allowed: false, reason: "Per-minute sending cap reached.", retryAfterMs: 60_000 };
  }
  if (sentToDomainToday >= effectiveLimits.perDomainDailyCap) {
    return {
      allowed: false,
      reason: `Daily cap for ${domain} reached.`,
      retryAfterMs: 60 * 60 * 1000
    };
  }

  return { allowed: true, reason: null, retryAfterMs: 0 };
}

async function requeueMessage(messageId: string, delayMs: number) {
  const queue = emailQueue();
  await queue.add("email.send", { messageId }, { delay: Math.max(delayMs, 1_000) });
  await queue.close();
}

async function markMessageSkipped(messageId: string, reason: string) {
  const message = await prisma.emailMessage.update({
    where: { id: messageId },
    data: {
      status: EmailMessageStatus.SKIPPED,
      skippedAt: new Date(),
      error: reason
    }
  });
  await prisma.emailEvent.create({
    data: {
      type: EmailEventType.SKIPPED,
      messageId,
      campaignId: message.campaignId,
      leadId: message.leadId,
      metadata: { reason }
    }
  });
  await prisma.campaignRecipient.update({
    where: { id: message.campaignRecipientId },
    data: { status: CampaignRecipientStatus.SKIPPED, reason }
  });
  await refreshSendJobProgress(message.sendJobId);
}

async function failMessage(messageId: string, reason: string) {
  const message = await prisma.emailMessage.update({
    where: { id: messageId },
    data: {
      status: EmailMessageStatus.FAILED,
      failedAt: new Date(),
      error: reason
    }
  });
  await prisma.emailEvent.create({
    data: {
      type: EmailEventType.FAILED,
      messageId,
      campaignId: message.campaignId,
      leadId: message.leadId,
      metadata: { reason }
    }
  });
  await prisma.campaignRecipient.update({
    where: { id: message.campaignRecipientId },
    data: { status: CampaignRecipientStatus.FAILED, reason }
  });
  await refreshSendJobProgress(message.sendJobId);
}

export async function pauseSendJob(sendJobId: string, reason: string) {
  const job = await prisma.sendJob.update({
    where: { id: sendJobId },
    data: { status: SendJobStatus.PAUSED, pausedAt: new Date(), lastError: reason }
  });
  await prisma.campaign.update({
    where: { id: job.campaignId },
    data: { status: CampaignStatus.PAUSED }
  });
  return job;
}

export async function refreshSendJobProgress(sendJobId: string) {
  const [job, counts] = await Promise.all([
    prisma.sendJob.findUnique({ where: { id: sendJobId } }),
    prisma.emailMessage.groupBy({ by: ["status"], where: { sendJobId }, _count: { status: true } })
  ]);
  if (!job) return null;

  const count = (status: EmailMessageStatus) =>
    counts.find((item) => item.status === status)?._count.status ?? 0;
  const queuedMessages = count(EmailMessageStatus.QUEUED);
  const sentMessages = count(EmailMessageStatus.SENT);
  const skippedMessages = count(EmailMessageStatus.SKIPPED);
  const failedMessages = count(EmailMessageStatus.FAILED);
  const sendingMessages = count(EmailMessageStatus.SENDING);
  const terminalMessages = sentMessages + skippedMessages + failedMessages;
  const totalMessages = queuedMessages + sendingMessages + terminalMessages;
  const isComplete = totalMessages > 0 && terminalMessages === totalMessages;

  const updated = await prisma.sendJob.update({
    where: { id: sendJobId },
    data: {
      queuedMessages,
      sentMessages,
      skippedMessages,
      failedMessages,
      status: isComplete ? SendJobStatus.COMPLETED : SendJobStatus.RUNNING,
      completedAt: isComplete ? new Date() : null
    }
  });

  await prisma.campaign.update({
    where: { id: job.campaignId },
    data: { status: isComplete ? CampaignStatus.COMPLETED : CampaignStatus.SENDING }
  });

  return updated;
}
