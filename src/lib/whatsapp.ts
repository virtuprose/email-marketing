import {
  ConversationDirection,
  DealStage,
  LeadEventType,
  LeadStatus,
  MessageChannel,
  Prisma,
  SendJobStatus,
  SuppressionReason,
  WhatsappCampaignStatus,
  WhatsappEventType,
  WhatsappLeadStatus,
  WhatsappMessageStatus,
  WhatsappRecipientStatus,
  WhatsappTemplateStatus,
  type Lead,
  type Offer,
  type WhatsappTemplate
} from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  detectConversationLanguage,
  ensureConversationForLead,
  recordConversationMessage
} from "@/lib/conversations";
import { whatsappQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { ingestWhatsappInboundReply } from "@/lib/replies";
import { parseSendingControl, SENDING_CONTROL_SETTINGS_KEY } from "@/lib/sending";

export type WhatsappAudienceFilter = {
  status: LeadStatus | "ALL";
  tag?: string;
  country?: string;
  maxRecipients: number;
};

export const WHATSAPP_WEBHOOK_PATH = "/api/webhooks/meta/whatsapp";

const blockedLeadStatuses: LeadStatus[] = [
  LeadStatus.SUPPRESSED,
  LeadStatus.UNSUBSCRIBED,
  LeadStatus.BOUNCED,
  LeadStatus.DO_NOT_CONTACT,
  LeadStatus.LOST
];

const optOutPhrases = [
  "stop",
  "unsubscribe",
  "remove me",
  "opt out",
  "do not contact",
  "don't contact",
  "no more messages"
];

export function normalizeWhatsappPhone(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .replace(/^whatsapp:/i, "");
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return `+${digits}`;
}

export function whatsappAddress(phoneE164: string) {
  return `whatsapp:${phoneE164}`;
}

export function isMetaWhatsappConfigured() {
  return Boolean(
    process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID && process.env.META_WABA_ID
  );
}

export function isMetaWhatsappDryRun() {
  return process.env.META_WHATSAPP_DRY_RUN !== "false";
}

export function appBaseUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function validateMetaWebhookSignature({
  rawBody,
  signature
}: {
  rawBody: string;
  signature: string | null;
}) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return false;
  if (!signature) return false;
  const normalizedSignature = signature.startsWith("sha256=") ? signature.slice("sha256=".length) : signature;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const actualBuffer = Buffer.from(normalizedSignature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function shouldValidateMetaSignatures() {
  return process.env.META_VALIDATE_SIGNATURE !== "false";
}

export function verifyMetaWebhookChallenge(searchParams: URLSearchParams) {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return challenge;
  }
  return null;
}

export function whatsappAudienceWhere(filter: WhatsappAudienceFilter): Prisma.LeadWhereInput {
  return {
    phoneE164: { not: null },
    whatsappOptIn: true,
    whatsappStatus: WhatsappLeadStatus.OPTED_IN,
    whatsappStoppedAt: null,
    status:
      filter.status === "ALL"
        ? { notIn: blockedLeadStatuses }
        : { equals: filter.status, notIn: blockedLeadStatuses },
    ...(filter.country ? { country: { contains: filter.country, mode: "insensitive" } } : {}),
    ...(filter.tag ? { tags: { some: { name: { equals: filter.tag, mode: "insensitive" } } } } : {})
  };
}

export function parseTemplateVariables(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function renderWhatsappTemplateVariables({
  variables,
  mapping,
  lead,
  offer
}: {
  variables: string[];
  mapping: Record<string, string>;
  lead: Lead;
  offer: Offer;
}) {
  const output: Record<string, string> = {};

  for (const variable of variables) {
    output[variable] = renderMappedValue(mapping[variable] || "firstName", lead, offer);
  }

  return output;
}

export function renderWhatsappPreview({
  template,
  variables
}: {
  template: Pick<WhatsappTemplate, "bodyPreview" | "variables">;
  variables: Record<string, string>;
}) {
  let preview = template.bodyPreview || "Approved Meta template preview unavailable.";
  for (const variable of template.variables) {
    const value = variables[variable] || `{{${variable}}}`;
    preview = preview.replaceAll(`{{${variable}}}`, value).replaceAll(`{{${Number(variable)}}}`, value);
  }
  return preview;
}

function renderMappedValue(mappingValue: string, lead: Lead, offer: Offer) {
  if (mappingValue.startsWith("literal:")) return mappingValue.replace(/^literal:/, "").trim();

  const values: Record<string, string | null | undefined> = {
    firstName: lead.firstName || "there",
    lastName: lead.lastName,
    fullName: [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.firstName || "there",
    company: lead.company || "your company",
    website: lead.website,
    role: lead.role,
    country: lead.country,
    offerName: offer.name,
    valueProposition: offer.valueProposition,
    senderName: "Virtuprose"
  };

  return values[mappingValue] || "";
}

export function whatsappReadyReason(
  lead: Pick<Lead, "phoneE164" | "whatsappOptIn" | "whatsappStatus" | "whatsappStoppedAt" | "status">
) {
  if (!lead.phoneE164) return "Missing WhatsApp phone.";
  if (!lead.whatsappOptIn) return "WhatsApp opt-in is not recorded.";
  if (lead.whatsappStatus !== WhatsappLeadStatus.OPTED_IN) return "WhatsApp status is not opted in.";
  if (lead.whatsappStoppedAt) return "Lead has opted out of WhatsApp.";
  if (blockedLeadStatuses.includes(lead.status)) return "Lead status blocks outreach.";
  return null;
}

export async function scheduleWhatsappCampaignSend(campaignId: string) {
  const queue = whatsappQueue();
  const messagesToQueue: Array<{ id: string; delayMs: number }> = [];
  const now = new Date();

  const sendJobId = await prisma.$transaction(async (tx) => {
    const control = parseSendingControl(
      (await tx.setting.findUnique({ where: { key: SENDING_CONTROL_SETTINGS_KEY } }))?.value
    );
    if (control.killSwitch) {
      throw new Error("Global kill switch is enabled. Turn it off before scheduling WhatsApp sends.");
    }

    const campaign = await tx.whatsappCampaign.findUnique({
      where: { id: campaignId },
      include: {
        offer: true,
        template: true,
        recipients: { include: { lead: true }, orderBy: { createdAt: "asc" } }
      }
    });
    if (!campaign) throw new Error("WhatsApp campaign not found.");
    if (campaign.status !== WhatsappCampaignStatus.APPROVED) {
      throw new Error("Only approved WhatsApp campaigns can be scheduled.");
    }
    if (campaign.template.status !== WhatsappTemplateStatus.APPROVED || !campaign.template.active) {
      throw new Error("Select an active approved WhatsApp template before sending.");
    }
    if (!campaign.recipients.length) {
      throw new Error("Campaign has no eligible WhatsApp recipients.");
    }

    const existingActiveJob = await tx.whatsappSendJob.findFirst({
      where: {
        campaignId,
        status: { in: [SendJobStatus.QUEUED, SendJobStatus.RUNNING, SendJobStatus.PAUSED] }
      }
    });
    if (existingActiveJob) return existingActiveJob.id;

    const sendJob = await tx.whatsappSendJob.create({
      data: {
        campaignId,
        status: SendJobStatus.QUEUED,
        totalRecipients: campaign.recipients.length
      }
    });

    let queuedMessages = 0;
    let skippedMessages = 0;
    const variableMapping = campaign.variableMapping as Record<string, string>;
    const spacingMs = Math.max(30_000, Math.floor((24 * 60 * 60 * 1000) / Math.max(1, campaign.dailyCap)));

    for (const [index, recipient] of campaign.recipients.entries()) {
      const blockReason = whatsappReadyReason(recipient.lead);
      const contentVariables = renderWhatsappTemplateVariables({
        variables: campaign.template.variables,
        mapping: variableMapping,
        lead: recipient.lead,
        offer: campaign.offer
      });
      const queuedAt = new Date(now.getTime() + index * spacingMs);

      const message = await tx.whatsappMessage.create({
        data: {
          sendJobId: sendJob.id,
          campaignId,
          campaignRecipientId: recipient.id,
          leadId: recipient.lead.id,
          templateId: campaign.template.id,
          status: blockReason ? WhatsappMessageStatus.SKIPPED : WhatsappMessageStatus.QUEUED,
          direction: "outbound_template",
          toPhoneE164: recipient.lead.phoneE164,
          contentVariables: contentVariables as Prisma.InputJsonObject,
          bodyText: renderWhatsappPreview({ template: campaign.template, variables: contentVariables }),
          queuedAt,
          skippedAt: blockReason ? now : null,
          error: blockReason
        }
      });

      await tx.whatsappCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: blockReason ? WhatsappRecipientStatus.SKIPPED : WhatsappRecipientStatus.QUEUED,
          reason: blockReason
        }
      });

      await tx.whatsappEvent.create({
        data: {
          type: blockReason ? WhatsappEventType.SKIPPED : WhatsappEventType.QUEUED,
          messageId: message.id,
          campaignId,
          leadId: recipient.lead.id,
          metadata: {
            queuedAt: queuedAt.toISOString(),
            reason: blockReason,
            metaTemplateName: campaign.template.metaTemplateName
          }
        }
      });

      if (blockReason) skippedMessages += 1;
      else {
        queuedMessages += 1;
        messagesToQueue.push({ id: message.id, delayMs: Math.max(0, queuedAt.getTime() - Date.now()) });
      }
    }

    await tx.whatsappSendJob.update({
      where: { id: sendJob.id },
      data: { queuedMessages, skippedMessages }
    });
    await tx.whatsappCampaign.update({
      where: { id: campaignId },
      data: { status: queuedMessages ? WhatsappCampaignStatus.SCHEDULED : WhatsappCampaignStatus.COMPLETED }
    });

    return sendJob.id;
  });

  for (const message of messagesToQueue) {
    await queue.add("whatsapp.send", { messageId: message.id }, { delay: message.delayMs });
  }
  await queue.close();
  return sendJobId;
}

export async function processWhatsappMessage(messageId: string) {
  const message = await prisma.whatsappMessage.findUnique({
    where: { id: messageId },
    include: {
      lead: true,
      template: true,
      campaign: true,
      campaignRecipient: true,
      sendJob: true
    }
  });
  if (!message || message.status !== WhatsappMessageStatus.QUEUED) return { skipped: true };
  if (!message.sendJob || !message.campaign || !message.template) {
    return markWhatsappMessageFailed(
      messageId,
      "WhatsApp message is missing send job, campaign, or template."
    );
  }
  if (message.sendJob.status === SendJobStatus.PAUSED) return { paused: true };

  const blockReason = whatsappReadyReason(message.lead);
  if (blockReason) return skipWhatsappMessage(message.id, blockReason);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const sentToday = await prisma.whatsappMessage.count({
    where: {
      campaignId: message.campaignId,
      status: {
        in: [WhatsappMessageStatus.SENT, WhatsappMessageStatus.DELIVERED, WhatsappMessageStatus.READ]
      },
      sentAt: { gte: dayStart }
    }
  });
  if (sentToday >= message.campaign.dailyCap) {
    await prisma.whatsappEvent.create({
      data: {
        type: WhatsappEventType.RATE_LIMITED,
        messageId: message.id,
        campaignId: message.campaignId,
        leadId: message.leadId,
        metadata: { dailyCap: message.campaign.dailyCap }
      }
    });
    const queue = whatsappQueue();
    await queue.add("whatsapp.send", { messageId: message.id }, { delay: 60 * 60 * 1000 });
    await queue.close();
    return { rateLimited: true };
  }

  await prisma.whatsappMessage.update({
    where: { id: message.id },
    data: { status: WhatsappMessageStatus.SENDING, startedAt: new Date() }
  });
  await prisma.whatsappSendJob.update({
    where: { id: message.sendJob.id },
    data: { status: SendJobStatus.RUNNING, startedAt: message.sendJob.startedAt ?? new Date() }
  });

  try {
    const result = await sendMetaTemplateMessage({
      toPhoneE164: message.toPhoneE164 || "",
      templateName: message.template.metaTemplateName,
      language: message.template.language,
      contentVariables: (message.contentVariables || {}) as Record<string, string>
    });

    await prisma.$transaction(async (tx) => {
      await tx.whatsappMessage.update({
        where: { id: message.id },
        data: {
          status: WhatsappMessageStatus.SENT,
          providerMessageId: result.providerMessageId,
          sentAt: new Date()
        }
      });
      await tx.whatsappCampaignRecipient.update({
        where: { id: message.campaignRecipientId! },
        data: { status: WhatsappRecipientStatus.SENT }
      });
      await tx.lead.update({
        where: { id: message.leadId },
        data: {
          status: LeadStatus.CONTACTED,
          lastWhatsappContactedAt: new Date()
        }
      });
      await tx.leadEvent.create({
        data: {
          leadId: message.leadId,
          type: LeadEventType.STATUS_CHANGED,
          message: result.dryRun
            ? "Meta WhatsApp template dry-run recorded."
            : "Meta WhatsApp template sent.",
          metadata: {
            messageId: message.id,
            providerMessageId: result.providerMessageId,
            dryRun: result.dryRun
          }
        }
      });
      await tx.whatsappEvent.create({
        data: {
          type: WhatsappEventType.SENT,
          messageId: message.id,
          campaignId: message.campaignId,
          leadId: message.leadId,
          metadata: { providerMessageId: result.providerMessageId, dryRun: result.dryRun }
        }
      });
      const language = detectConversationLanguage(message.bodyText || "");
      const conversation = await ensureConversationForLead({
        tx,
        leadId: message.leadId,
        channel: MessageChannel.WHATSAPP,
        externalContactId: message.toPhoneE164,
        language
      });
      await recordConversationMessage({
        tx,
        conversationId: conversation.id,
        leadId: message.leadId,
        channel: MessageChannel.WHATSAPP,
        direction: ConversationDirection.OUTBOUND,
        bodyText: message.bodyText || "",
        language,
        providerMessageId: result.providerMessageId,
        whatsappMessageId: message.id
      });
    });
    await refreshWhatsappSendJobProgress(message.sendJob.id);
    return { ok: true, providerMessageId: result.providerMessageId };
  } catch (error) {
    return markWhatsappMessageFailed(
      message.id,
      error instanceof Error ? error.message : "Meta WhatsApp send failed."
    );
  }
}

export async function sendMetaTemplateMessage({
  toPhoneE164,
  templateName,
  language,
  contentVariables
}: {
  toPhoneE164: string;
  templateName: string;
  language: string;
  contentVariables: Record<string, string>;
}) {
  if (isMetaWhatsappDryRun()) {
    return { providerMessageId: `dry-run-meta-whatsapp-${Date.now()}`, dryRun: true };
  }
  if (!isMetaWhatsappConfigured()) {
    throw new Error("Meta WhatsApp Cloud API is not configured.");
  }

  const response = await metaGraphPost<{ messages?: Array<{ id?: string }> }>(
    `${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: toMetaRecipient(toPhoneE164),
      type: "template",
      template: {
        name: templateName,
        language: { code: language || "en" },
        ...metaTemplateComponents(contentVariables)
      }
    }
  );

  const providerMessageId = response.messages?.[0]?.id;
  if (!providerMessageId) throw new Error("Meta did not return a WhatsApp message ID.");
  return { providerMessageId, dryRun: false };
}

export async function sendMetaTextMessage({ toPhoneE164, body }: { toPhoneE164: string; body: string }) {
  if (isMetaWhatsappDryRun()) {
    return { providerMessageId: `dry-run-meta-whatsapp-reply-${Date.now()}`, dryRun: true };
  }
  if (!isMetaWhatsappConfigured()) {
    throw new Error("Meta WhatsApp Cloud API is not configured.");
  }

  const response = await metaGraphPost<{ messages?: Array<{ id?: string }> }>(
    `${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toMetaRecipient(toPhoneE164),
      type: "text",
      text: {
        preview_url: false,
        body
      }
    }
  );

  const providerMessageId = response.messages?.[0]?.id;
  if (!providerMessageId) throw new Error("Meta did not return a WhatsApp message ID.");
  return { providerMessageId, dryRun: false };
}

export async function submitMetaTemplateForApproval({
  name,
  language,
  category,
  bodyText,
  exampleVariables
}: {
  name: string;
  language: string;
  category: WhatsappTemplate["category"];
  bodyText: string;
  exampleVariables: Record<string, string>;
}) {
  if (isMetaWhatsappDryRun()) {
    return {
      metaTemplateId: `dry-run-template-${Date.now()}`,
      status: WhatsappTemplateStatus.PENDING,
      dryRun: true
    };
  }
  if (!isMetaWhatsappConfigured()) {
    throw new Error("Meta WhatsApp Cloud API is not configured.");
  }

  const examples = Object.keys(exampleVariables)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => exampleVariables[key])
    .filter(Boolean);
  const response = await metaGraphPost<{ id?: string; status?: string }>(
    `${process.env.META_WABA_ID}/message_templates`,
    {
      name,
      language: language || "en",
      category: metaTemplateCategory(category),
      components: [
        {
          type: "BODY",
          text: bodyText,
          ...(examples.length ? { example: { body_text: [examples] } } : {})
        }
      ]
    }
  );

  return {
    metaTemplateId: response.id || null,
    status: normalizeMetaTemplateStatus(response.status),
    dryRun: false
  };
}

export async function syncMetaTemplateStatus({
  templateName,
  language
}: {
  templateName: string;
  language: string;
}) {
  if (isMetaWhatsappDryRun()) {
    return { metaTemplateId: null, status: WhatsappTemplateStatus.APPROVED, dryRun: true };
  }
  if (!isMetaWhatsappConfigured()) {
    throw new Error("Meta WhatsApp Cloud API is not configured.");
  }

  const params = new URLSearchParams({
    name: templateName,
    fields: "id,name,status,language,category"
  });

  const response = await metaGraphGet<{
    data?: Array<{ id?: string; status?: string; language?: string }>;
  }>(`${process.env.META_WABA_ID}/message_templates?${params.toString()}`);
  const template =
    response.data?.find((item) => item.language === language) ?? response.data?.find(Boolean) ?? null;
  if (!template) throw new Error("Meta template was not found for this name/language.");

  return {
    metaTemplateId: template.id || null,
    status: normalizeMetaTemplateStatus(template.status),
    dryRun: false
  };
}

async function metaGraphPost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${metaGraphBaseUrl()}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `Meta Graph API returned ${response.status}`);
  }
  return data;
}

export async function handleMetaWhatsappWebhook(payload: MetaWhatsappWebhookPayload) {
  const outcomes: Array<Record<string, unknown>> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const status of value.statuses ?? []) {
        outcomes.push(await handleMetaStatus(status));
      }
      for (const message of value.messages ?? []) {
        outcomes.push(
          await handleMetaInboundMessage({
            message,
            metadata: value.metadata,
            contacts: value.contacts,
            raw: payload
          })
        );
      }
    }
  }

  return { processed: outcomes.length, outcomes };
}

async function handleMetaStatus(status: MetaWhatsappStatus) {
  const providerMessageId = status.id;
  if (!providerMessageId) return { ignored: true, reason: "missing_status_id" };

  const message = await prisma.whatsappMessage.findUnique({ where: { providerMessageId } });
  if (!message) return { ignored: true, providerMessageId };

  const normalized = normalizeMetaMessageStatus(status.status);
  const now = new Date(Number(status.timestamp || Math.floor(Date.now() / 1000)) * 1000);
  const update: Prisma.WhatsappMessageUpdateInput = {
    status: normalized,
    error: status.errors?.[0]?.message || status.errors?.[0]?.code || null
  };
  if (normalized === WhatsappMessageStatus.DELIVERED) update.deliveredAt = now;
  if (normalized === WhatsappMessageStatus.READ) update.readAt = now;
  if (normalized === WhatsappMessageStatus.FAILED) update.failedAt = now;

  await prisma.$transaction(async (tx) => {
    await tx.whatsappMessage.update({ where: { id: message.id }, data: update });
    if (message.campaignRecipientId) {
      await tx.whatsappCampaignRecipient.update({
        where: { id: message.campaignRecipientId },
        data: { status: recipientStatusForMessageStatus(normalized) }
      });
    }
    await tx.whatsappEvent.create({
      data: {
        type: eventTypeForMessageStatus(normalized),
        messageId: message.id,
        campaignId: message.campaignId,
        leadId: message.leadId,
        metadata: status as Prisma.InputJsonObject
      }
    });
  });

  if (message.sendJobId) await refreshWhatsappSendJobProgress(message.sendJobId);
  return { ok: true, providerMessageId, status: normalized };
}

async function handleMetaInboundMessage({
  message,
  metadata,
  contacts,
  raw
}: {
  message: MetaWhatsappInboundMessage;
  metadata?: MetaWhatsappMetadata;
  contacts?: MetaWhatsappContact[];
  raw: MetaWhatsappWebhookPayload;
}) {
  const providerMessageId = message.id;
  if (!providerMessageId) return { ignored: true, reason: "missing_message_id" };

  const existing = await prisma.inboundReply.findUnique({
    where: { providerMessageId },
    include: { lead: true, drafts: { orderBy: { createdAt: "desc" }, take: 1 } }
  });
  if (existing) return { duplicate: true, replyId: existing.id };

  const existingMessage = await prisma.whatsappMessage.findUnique({
    where: { providerMessageId },
    include: { inboundReplies: { orderBy: { createdAt: "desc" }, take: 1 } }
  });
  if (existingMessage) {
    return {
      duplicate: true,
      messageId: existingMessage.id,
      replyId: existingMessage.inboundReplies[0]?.id ?? null
    };
  }

  const fromPhoneE164 = normalizeWhatsappPhone(message.from);
  const toPhoneE164 = normalizeWhatsappPhone(
    metadata?.display_phone_number || metadata?.phone_number_id || ""
  );
  const bodyText = extractMetaInboundBody(message);
  const receivedAt = new Date(Number(message.timestamp || Math.floor(Date.now() / 1000)) * 1000);
  if (!fromPhoneE164) throw new Error("Inbound Meta WhatsApp webhook is missing sender phone.");

  const profileName = whatsappProfileNameForMessage(contacts, fromPhoneE164);
  const parsedName = splitWhatsappProfileName(profileName);
  let lead = await prisma.lead.findUnique({ where: { phoneE164: fromPhoneE164 } });
  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        email: `${fromPhoneE164.replace(/\D/g, "")}@whatsapp.local`,
        phoneE164: fromPhoneE164,
        firstName: parsedName.firstName,
        lastName: parsedName.lastName,
        source: "whatsapp_inbound",
        legalBasis: "Inbound WhatsApp conversation",
        consentNotes: "Created from inbound WhatsApp reply.",
        whatsappOptIn: true,
        whatsappConsentSource: "Inbound WhatsApp reply",
        whatsappStatus: WhatsappLeadStatus.OPTED_IN,
        lastWhatsappCustomerMessageAt: receivedAt,
        whatsappServiceWindowExpiresAt: new Date(receivedAt.getTime() + 24 * 60 * 60 * 1000),
        status: LeadStatus.REPLIED,
        scoreEngagement: 50
      }
    });
  } else {
    const stopped = lead.whatsappStatus === WhatsappLeadStatus.STOPPED || Boolean(lead.whatsappStoppedAt);
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        ...(parsedName.firstName && !lead.firstName ? { firstName: parsedName.firstName } : {}),
        ...(parsedName.lastName && !lead.lastName ? { lastName: parsedName.lastName } : {}),
        whatsappOptIn: stopped ? lead.whatsappOptIn : true,
        whatsappConsentSource: lead.whatsappConsentSource || "Inbound WhatsApp reply",
        whatsappStatus: stopped ? lead.whatsappStatus : WhatsappLeadStatus.OPTED_IN,
        lastWhatsappCustomerMessageAt: receivedAt,
        whatsappServiceWindowExpiresAt: new Date(receivedAt.getTime() + 24 * 60 * 60 * 1000)
      }
    });
  }

  const latestOutbound = await prisma.whatsappMessage.findFirst({
    where: {
      leadId: lead.id,
      direction: { startsWith: "outbound" },
      status: {
        in: [WhatsappMessageStatus.SENT, WhatsappMessageStatus.DELIVERED, WhatsappMessageStatus.READ]
      }
    },
    orderBy: { sentAt: "desc" }
  });

  const inboundMessage = await prisma.whatsappMessage.create({
    data: {
      leadId: lead.id,
      campaignId: latestOutbound?.campaignId ?? null,
      status: WhatsappMessageStatus.REPLIED,
      direction: "inbound",
      fromPhoneE164,
      toPhoneE164,
      bodyText,
      providerMessageId,
      sentAt: receivedAt
    }
  });

  if (isWhatsappOptOut(bodyText)) {
    await suppressLeadForWhatsappOptOut(lead.id, bodyText);
  }

  const result = await ingestWhatsappInboundReply({
    leadId: lead.id,
    whatsappMessageId: inboundMessage.id,
    fromPhoneE164,
    toPhoneE164,
    subject: "WhatsApp reply",
    bodyText,
    source: "meta_whatsapp",
    providerMessageId,
    raw: raw as Prisma.InputJsonObject
  });

  await prisma.whatsappEvent.create({
    data: {
      type: WhatsappEventType.REPLY_RECEIVED,
      messageId: inboundMessage.id,
      campaignId: latestOutbound?.campaignId,
      leadId: lead.id,
      metadata: { replyId: result.reply.id, fromPhoneE164 }
    }
  });

  return { duplicate: result.duplicate, replyId: result.reply.id };
}

export function whatsappProfileNameForMessage(
  contacts: MetaWhatsappContact[] | undefined,
  fromPhoneE164: string
) {
  const fromDigits = normalizeWhatsappPhone(fromPhoneE164).replace(/\D/g, "");
  const match = contacts?.find(
    (contact) => normalizeWhatsappPhone(contact.wa_id).replace(/\D/g, "") === fromDigits
  );
  const name = match?.profile?.name?.trim();
  return name || null;
}

function splitWhatsappProfileName(name: string | null) {
  if (!name) return { firstName: null, lastName: null };
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  return {
    firstName: parts[0].slice(0, 80),
    lastName: parts.slice(1).join(" ").slice(0, 120) || null
  };
}

export function isWhatsappOptOut(bodyText: string) {
  const normalized = bodyText.trim().toLowerCase();
  return optOutPhrases.some((phrase) => normalized === phrase || normalized.includes(phrase));
}

async function suppressLeadForWhatsappOptOut(leadId: string, bodyText: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.DO_NOT_CONTACT,
        whatsappOptIn: false,
        whatsappStatus: WhatsappLeadStatus.STOPPED,
        whatsappStoppedAt: new Date()
      }
    });
    await tx.suppressionEntry.upsert({
      where: { email: lead.email },
      update: {
        reason: SuppressionReason.UNSUBSCRIBED,
        source: "whatsapp_opt_out",
        notes: bodyText
      },
      create: {
        email: lead.email,
        reason: SuppressionReason.UNSUBSCRIBED,
        source: "whatsapp_opt_out",
        notes: bodyText
      }
    });
    await tx.whatsappEvent.create({
      data: {
        type: WhatsappEventType.OPTED_OUT,
        leadId: lead.id,
        metadata: { bodyText }
      }
    });
    await tx.leadEvent.create({
      data: {
        leadId: lead.id,
        type: LeadEventType.SUPPRESSED,
        message: "Lead opted out of WhatsApp messages.",
        metadata: { bodyText }
      }
    });
  });
}

export async function pauseWhatsappSendJob(sendJobId: string, reason: string) {
  await prisma.whatsappSendJob.update({
    where: { id: sendJobId },
    data: { status: SendJobStatus.PAUSED, pausedAt: new Date(), lastError: reason }
  });
}

export async function refreshWhatsappSendJobProgress(sendJobId: string) {
  const job = await prisma.whatsappSendJob.findUnique({ where: { id: sendJobId } });
  if (!job) return null;

  const count = (status: WhatsappMessageStatus | WhatsappMessageStatus[]) =>
    prisma.whatsappMessage.count({
      where: { sendJobId, status: Array.isArray(status) ? { in: status } : status }
    });

  const [queuedMessages, sentMessages, deliveredMessages, readMessages, skippedMessages, failedMessages] =
    await Promise.all([
      count(WhatsappMessageStatus.QUEUED),
      count(WhatsappMessageStatus.SENT),
      count(WhatsappMessageStatus.DELIVERED),
      count(WhatsappMessageStatus.READ),
      count(WhatsappMessageStatus.SKIPPED),
      count(WhatsappMessageStatus.FAILED)
    ]);

  const activeMessages = await count(WhatsappMessageStatus.SENDING);
  const isComplete = queuedMessages + activeMessages === 0;
  const terminalCount = sentMessages + deliveredMessages + readMessages + skippedMessages + failedMessages;

  const updated = await prisma.whatsappSendJob.update({
    where: { id: sendJobId },
    data: {
      queuedMessages,
      sentMessages,
      deliveredMessages,
      readMessages,
      skippedMessages,
      failedMessages,
      status: isComplete ? SendJobStatus.COMPLETED : SendJobStatus.RUNNING,
      completedAt: isComplete ? new Date() : null
    }
  });

  if (isComplete && terminalCount >= job.totalRecipients) {
    await prisma.whatsappCampaign.update({
      where: { id: job.campaignId },
      data: { status: WhatsappCampaignStatus.COMPLETED }
    });
  } else if (!isComplete) {
    await prisma.whatsappCampaign.update({
      where: { id: job.campaignId },
      data: { status: WhatsappCampaignStatus.SENDING }
    });
  }

  return updated;
}

async function skipWhatsappMessage(messageId: string, reason: string) {
  const message = await prisma.whatsappMessage.update({
    where: { id: messageId },
    data: {
      status: WhatsappMessageStatus.SKIPPED,
      skippedAt: new Date(),
      error: reason
    }
  });
  if (message.campaignRecipientId) {
    await prisma.whatsappCampaignRecipient.update({
      where: { id: message.campaignRecipientId },
      data: { status: WhatsappRecipientStatus.SKIPPED, reason }
    });
  }
  await prisma.whatsappEvent.create({
    data: {
      type: WhatsappEventType.SKIPPED,
      messageId: message.id,
      campaignId: message.campaignId,
      leadId: message.leadId,
      metadata: { reason }
    }
  });
  if (message.sendJobId) await refreshWhatsappSendJobProgress(message.sendJobId);
  return { skipped: true, reason };
}

async function markWhatsappMessageFailed(messageId: string, reason: string) {
  const message = await prisma.whatsappMessage.update({
    where: { id: messageId },
    data: {
      status: WhatsappMessageStatus.FAILED,
      failedAt: new Date(),
      error: reason
    }
  });
  if (message.campaignRecipientId) {
    await prisma.whatsappCampaignRecipient.update({
      where: { id: message.campaignRecipientId },
      data: { status: WhatsappRecipientStatus.FAILED, reason }
    });
  }
  await prisma.whatsappEvent.create({
    data: {
      type: WhatsappEventType.FAILED,
      messageId: message.id,
      campaignId: message.campaignId,
      leadId: message.leadId,
      metadata: { reason }
    }
  });
  if (message.sendJobId) await refreshWhatsappSendJobProgress(message.sendJobId);
  return { failed: true, reason };
}

function normalizeMetaMessageStatus(status: string | undefined) {
  switch ((status || "").toLowerCase()) {
    case "delivered":
      return WhatsappMessageStatus.DELIVERED;
    case "read":
      return WhatsappMessageStatus.READ;
    case "failed":
    case "undelivered":
      return WhatsappMessageStatus.FAILED;
    case "sent":
    case "queued":
    case "accepted":
    default:
      return WhatsappMessageStatus.SENT;
  }
}

function recipientStatusForMessageStatus(status: WhatsappMessageStatus) {
  if (status === WhatsappMessageStatus.DELIVERED) return WhatsappRecipientStatus.DELIVERED;
  if (status === WhatsappMessageStatus.READ) return WhatsappRecipientStatus.READ;
  if (status === WhatsappMessageStatus.FAILED) return WhatsappRecipientStatus.FAILED;
  return WhatsappRecipientStatus.SENT;
}

function eventTypeForMessageStatus(status: WhatsappMessageStatus) {
  if (status === WhatsappMessageStatus.DELIVERED) return WhatsappEventType.DELIVERED;
  if (status === WhatsappMessageStatus.READ) return WhatsappEventType.READ;
  if (status === WhatsappMessageStatus.FAILED) return WhatsappEventType.FAILED;
  return WhatsappEventType.SENT;
}

export function ownerHandoffRequired(intentStage: DealStage | null, confidence: number, riskFlags: string[]) {
  return intentStage === DealStage.HOT || confidence < 65 || riskFlags.length > 0;
}

export function metaTemplateComponents(contentVariables: Record<string, string>) {
  const parameters = Object.keys(contentVariables)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => ({
      type: "text",
      text: contentVariables[key] || " "
    }));

  return parameters.length
    ? {
        components: [
          {
            type: "body",
            parameters
          }
        ]
      }
    : {};
}

function metaTemplateCategory(category: WhatsappTemplate["category"]) {
  if (category === "UTILITY" || category === "AUTHENTICATION") return category;
  return "MARKETING";
}

function normalizeMetaTemplateStatus(status: string | null | undefined) {
  switch ((status || "").toUpperCase()) {
    case "APPROVED":
      return WhatsappTemplateStatus.APPROVED;
    case "REJECTED":
      return WhatsappTemplateStatus.REJECTED;
    case "PAUSED":
      return WhatsappTemplateStatus.PAUSED;
    case "DISABLED":
      return WhatsappTemplateStatus.DISABLED;
    case "PENDING":
    default:
      return WhatsappTemplateStatus.PENDING;
  }
}

function extractMetaInboundBody(message: MetaWhatsappInboundMessage) {
  if (message.type === "text" && message.text?.body) return message.text.body.trim();
  if (message.type === "button" && message.button?.text) return message.button.text.trim();
  if (message.type === "interactive" && message.interactive?.button_reply?.title) {
    return message.interactive.button_reply.title.trim();
  }
  return `Unsupported WhatsApp ${message.type || "message"} received. Please describe what you need in text.`;
}

async function metaGraphGet<T>(path: string): Promise<T> {
  const response = await fetch(`${metaGraphBaseUrl()}/${path.replace(/^\//, "")}`, {
    headers: {
      Authorization: `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`
    }
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `Meta Graph API returned ${response.status}`);
  }
  return data;
}

function metaGraphBaseUrl() {
  const version = process.env.META_GRAPH_API_VERSION || "v22.0";
  return `https://graph.facebook.com/${version.replace(/^\//, "")}`;
}

function toMetaRecipient(phoneE164: string) {
  return normalizeWhatsappPhone(phoneE164).replace(/^\+/, "");
}

export type MetaWhatsappWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value: {
        messaging_product?: string;
        metadata?: MetaWhatsappMetadata;
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: MetaWhatsappInboundMessage[];
        statuses?: MetaWhatsappStatus[];
      };
    }>;
  }>;
};

type MetaWhatsappContact = {
  wa_id?: string;
  profile?: { name?: string };
};

type MetaWhatsappMetadata = {
  display_phone_number?: string;
  phone_number_id?: string;
};

type MetaWhatsappInboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string } };
};

type MetaWhatsappStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: string; title?: string; message?: string }>;
};
