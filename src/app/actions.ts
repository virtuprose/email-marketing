"use server";

import {
  CampaignObjective,
  CampaignRecipientStatus,
  CampaignReviewSeverity,
  CampaignStatus,
  DealStage,
  EmailDesignValidationStatus,
  EmailMessageStatus,
  ImportRowStatus,
  LeadEventType,
  LeadStatus,
  MeetingBookingStatus,
  MeetingSlotStatus,
  MessageChannel,
  Prisma,
  SalesLeadStage,
  SendJobStatus,
  SuppressionReason,
  WhatsappCampaignStatus,
  WhatsappEventType,
  WhatsappTemplateCategory,
  WhatsappTemplateStatus,
  WhatsappMessageStatus,
  type Lead
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  campaignHasBlockers,
  generateCampaignSequenceForOffer,
  reviewCampaign,
  type AudienceFilter,
  type OfferForGeneration
} from "@/lib/campaigns";
import { linesToArray } from "@/lib/format";
import { normalizeEmail, isValidEmail } from "@/lib/imports";
import { prisma } from "@/lib/prisma";
import { emailQueue, whatsappQueue } from "@/lib/queue";
import {
  ingestInboundReply,
  markReplyAsHot,
  markReplyOwnerReviewed,
  pauseAiForLead,
  previewAiAssistantReply,
  processInboundReply,
  resumeAiForLead,
  sendAiReplyDraft,
  updateDealStage
} from "@/lib/replies";
import {
  AI_ASSISTANT_LAST_TEST_KEY,
  aiAssistantFormSchema,
  saveAiAssistantSettings,
  sendMeetingBookedOwnerAlert,
  settingsFromForm
} from "@/lib/ai-assistant";
import {
  prepareEmailDesignHtml,
  renderCustomEmailHtml,
  MAX_EMAIL_DESIGNS_PER_CAMPAIGN
} from "@/lib/email-designs";
import { COMPLIANCE_SETTINGS_KEY, parseComplianceSettings } from "@/lib/settings";
import { generateDefaultMeetingAvailability } from "@/lib/meeting-availability";
import {
  SENDING_CONTROL_SETTINGS_KEY,
  appBaseUrl,
  renderEmailCopy,
  scheduleCampaignSend,
  sendEmailDesignTest,
  sendTestEmail,
  sendingAccountStatus,
  pauseSendJob
} from "@/lib/sending";
import {
  parseTemplateVariables,
  scheduleWhatsappCampaignSend,
  sendMetaTemplateMessage,
  submitMetaTemplateForApproval,
  syncMetaTemplateStatus,
  pauseWhatsappSendJob,
  whatsappAudienceWhere,
  type WhatsappAudienceFilter
} from "@/lib/whatsapp";

const offerSchema = z.object({
  name: z.string().min(3),
  targetAudience: z.string().min(5),
  valueProposition: z.string().min(5),
  ctaStyle: z.string().min(3),
  aiVoiceRules: z.string().min(5)
});

const campaignSchema = z.object({
  name: z.string().min(3),
  offerId: z.string().min(1),
  objective: z.nativeEnum(CampaignObjective),
  status: z.nativeEnum(LeadStatus).or(z.literal("ALL")),
  tag: z.string().optional(),
  country: z.string().optional(),
  maxRecipients: z.coerce.number().int().min(1).max(5000)
});

const campaignLeadComplianceSchema = z.object({
  campaignId: z.string().min(1),
  source: z.string().min(2).max(120),
  country: z.string().min(2).max(120),
  legalBasis: z.string().min(10).max(500),
  confirmation: z.string().optional()
});

const campaignTimingSchema = z.object({
  campaignId: z.string().min(1),
  startAt: z.string().min(1),
  spacingSeconds: z.coerce.number().int().min(5).max(3600)
});

const complianceSettingsSchema = z.object({
  senderName: z.string().min(1),
  senderEmail: z.string().email(),
  physicalAddress: z.string().min(5),
  unsubscribeUrl: z.string().url()
});

const sendingAccountSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional().or(z.literal("")),
  host: z.string().optional().or(z.literal("")),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().optional().or(z.literal("")),
  dryRun: z.boolean(),
  dailyCap: z.coerce.number().int().min(1).max(5000),
  perMinuteCap: z.coerce.number().int().min(1).max(100),
  perDomainDailyCap: z.coerce.number().int().min(1).max(1000),
  minDelaySeconds: z.coerce.number().int().min(1).max(3600)
});

const testEmailSchema = z.object({
  sendingAccountId: z.string().min(1),
  to: z.string().email()
});

const emailDesignTemplateIdSchema = z.object({
  campaignId: z.string().min(1),
  templateId: z.string().min(1)
});

const emailDesignTestSchema = z.object({
  campaignId: z.string().min(1),
  templateId: z.string().min(1),
  sendingAccountId: z.string().min(1),
  to: z.string().email()
});

const manualReplySchema = z.object({
  fromEmail: z.string().email(),
  toEmail: z.string().email().optional().or(z.literal("")),
  subject: z.string().min(1),
  bodyText: z.string().min(5)
});

const replyIdSchema = z.object({
  replyId: z.string().min(1)
});

const leadAiControlSchema = z.object({
  leadId: z.string().min(1),
  replyId: z.string().optional().or(z.literal("")),
  returnTo: z.string().optional().or(z.literal(""))
});

const aiReplyDraftSchema = z.object({
  draftId: z.string().min(1),
  replyId: z.string().min(1),
  sendingAccountId: z.string().optional().or(z.literal("")),
  returnTo: z.string().optional().or(z.literal(""))
});

const aiAssistantTestSchema = z.object({
  channel: z.nativeEnum(MessageChannel),
  subject: z.string().optional().or(z.literal("")),
  bodyText: z.string().min(2)
});

const dealStageSchema = z.object({
  dealId: z.string().min(1),
  stage: z.nativeEnum(DealStage),
  notes: z.string().optional()
});

const meetingSlotSchema = z.object({
  startAt: z.string().min(1),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  timezone: z.string().min(3).default("Asia/Kuwait"),
  notes: z.string().optional().or(z.literal(""))
});

const meetingSlotStatusSchema = z.object({
  slotId: z.string().min(1),
  status: z.nativeEnum(MeetingSlotStatus)
});

const bookMeetingSlotSchema = z.object({
  replyId: z.string().min(1),
  slotId: z.string().min(1),
  returnTo: z.string().optional().or(z.literal(""))
});

const whatsappTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3),
  metaTemplateName: z
    .string()
    .min(3)
    .regex(/^[a-z0-9_]+$/),
  language: z.string().min(2).default("en"),
  category: z.nativeEnum(WhatsappTemplateCategory),
  status: z.nativeEnum(WhatsappTemplateStatus),
  bodyPreview: z.string().optional(),
  active: z.boolean()
});

const whatsappCampaignSchema = z.object({
  name: z.string().min(3),
  offerId: z.string().optional(),
  templateId: z.string().min(1),
  status: z.nativeEnum(LeadStatus).or(z.literal("ALL")),
  tag: z.string().optional(),
  country: z.string().optional(),
  maxRecipients: z.coerce.number().int().min(1).max(5000),
  dailyCap: z.coerce.number().int().min(1).max(500),
  sendWindowStart: z.string().optional(),
  sendWindowEnd: z.string().optional()
});

const whatsappCampaignIdSchema = z.object({
  campaignId: z.string().min(1)
});

const blockedLeadStatuses: LeadStatus[] = [
  LeadStatus.SUPPRESSED,
  LeadStatus.UNSUBSCRIBED,
  LeadStatus.BOUNCED,
  LeadStatus.DO_NOT_CONTACT
];

export type AiAssistantSettingsFormValues = {
  enabled: boolean;
  mode: string;
  ownerHotLeadEmail: string;
  meetingBookedEmailEnabled: boolean;
  meetingBookedEmailRecipient: string;
  whatsappEnabled: boolean;
  whatsappAutoReply: boolean;
  emailEnabled: boolean;
  emailAutoReply: boolean;
  autoSendMinimum: string;
  draftMinimum: string;
  minReplyDelaySeconds: string;
  maxReplyDelaySeconds: string;
  dailyAutoReplyCap: string;
  businessRules: string;
  classifier: string;
  whatsappReply: string;
  emailReply: string;
  safety: string;
  companyIntro: string;
  services: string;
  portfolioLinks: string;
  pricingRules: string;
  faqs: string;
  forbiddenClaims: string;
};

export type AiAssistantSettingsActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors: Record<string, string[]>;
  values?: AiAssistantSettingsFormValues;
  formKey: string;
};

function offerForGeneration(offer: OfferForGeneration) {
  return offer;
}

function audienceWhere(filter: AudienceFilter): Prisma.LeadWhereInput {
  return {
    status:
      filter.status === "ALL"
        ? { notIn: blockedLeadStatuses }
        : { equals: filter.status, notIn: blockedLeadStatuses },
    ...(filter.country ? { country: { contains: filter.country, mode: "insensitive" } } : {}),
    ...(filter.tag ? { tags: { some: { name: { equals: filter.tag, mode: "insensitive" } } } } : {})
  };
}

function parseManualSlotDate(value: string, timezone: string) {
  const trimmed = value.trim();
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) return new Date(trimmed);
  const offset = timezone === "Asia/Kuwait" ? "+03:00" : "";
  const date = new Date(`${trimmed}${trimmed.includes(":") ? ":00" : "T00:00:00"}${offset}`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Enter a valid meeting slot date and time.");
  }
  return date;
}

function parseKuwaitDateTimeLocal(value: string) {
  const trimmed = value.trim();
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) return new Date(trimmed);
  const date = new Date(`${trimmed.length === 16 ? `${trimmed}:00` : trimmed}+03:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Enter a valid campaign timing date and time.");
  }
  return date;
}

async function getComplianceSettings(tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const setting = await tx.setting.findUnique({ where: { key: COMPLIANCE_SETTINGS_KEY } });
  return parseComplianceSettings(setting?.value);
}

async function buildCampaignReviewItems(
  campaignId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const campaign = await tx.campaign.findUnique({
    where: { id: campaignId },
    include: {
      offer: true,
      steps: { orderBy: { stepOrder: "asc" } },
      recipients: { include: { lead: true } },
      selectedEmailDesignTemplate: true
    }
  });

  if (!campaign) throw new Error("Campaign not found.");

  const recipientLeads = campaign.recipients.map((recipient) => recipient.lead);
  const suppressedCount = recipientLeads.filter((lead) => blockedLeadStatuses.includes(lead.status)).length;
  const missingComplianceCount = recipientLeads.filter(
    (lead) => !lead.country || !lead.source || !lead.legalBasis
  ).length;
  const compliance = await getComplianceSettings(tx);

  const items = reviewCampaign({
    audienceCount: recipientLeads.length,
    suppressedCount,
    missingComplianceCount,
    offer: offerForGeneration(campaign.offer),
    subjectBodies: campaign.steps.map((step) => ({ subject: step.subject, body: step.body })),
    compliance
  });

  const selectedDesign = campaign.selectedEmailDesignTemplate;
  if (selectedDesign) {
    const hasErrors = selectedDesign.status === EmailDesignValidationStatus.BLOCKED;
    items.push({
      key: "email_design",
      label: "Custom email design",
      severity: hasErrors
        ? CampaignReviewSeverity.BLOCK
        : selectedDesign.warnings.length
          ? CampaignReviewSeverity.WARNING
          : CampaignReviewSeverity.PASS,
      message: hasErrors
        ? `Fix custom HTML design: ${selectedDesign.errors.join("; ")}`
        : selectedDesign.warnings.length
          ? `Custom design can send, but review: ${selectedDesign.warnings.join("; ")}`
          : "Selected custom email design is valid."
    });
  }

  return items;
}

async function replaceCampaignReview(
  campaignId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const items = await buildCampaignReviewItems(campaignId, tx);

  await tx.campaignReview.deleteMany({ where: { campaignId } });
  await tx.campaignReview.createMany({
    data: items.map((item) => ({
      campaignId,
      key: item.key,
      label: item.label,
      severity: item.severity,
      message: item.message
    }))
  });

  const hasBlockers = campaignHasBlockers(items);
  await tx.campaign.update({
    where: { id: campaignId },
    data: {
      status: hasBlockers ? CampaignStatus.REVIEW_BLOCKED : CampaignStatus.REVIEW_READY,
      approvedAt: null
    }
  });

  return items;
}

async function assertCampaignDesignEditable(
  tx: Prisma.TransactionClient | typeof prisma,
  campaignId: string
) {
  const campaign = await tx.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true }
  });
  if (!campaign) throw new Error("Campaign not found.");
  const lockedStatuses: CampaignStatus[] = [
    CampaignStatus.SCHEDULED,
    CampaignStatus.SENDING,
    CampaignStatus.PAUSED,
    CampaignStatus.COMPLETED,
    CampaignStatus.ARCHIVED
  ];
  if (lockedStatuses.includes(campaign.status)) {
    throw new Error("Email designs cannot be changed after sending has been scheduled.");
  }
}

export async function createOffer(formData: FormData) {
  const parsed = offerSchema.parse({
    name: formData.get("name"),
    targetAudience: formData.get("targetAudience"),
    valueProposition: formData.get("valueProposition"),
    ctaStyle: formData.get("ctaStyle"),
    aiVoiceRules: formData.get("aiVoiceRules")
  });

  const offer = await prisma.offer.create({
    data: {
      ...parsed,
      painPoints: linesToArray(formData.get("painPoints")),
      proofPoints: linesToArray(formData.get("proofPoints")),
      servicesIncluded: linesToArray(formData.get("servicesIncluded")),
      disallowedClaims: linesToArray(formData.get("disallowedClaims"))
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "offer.created",
      entityType: "offer",
      entityId: offer.id,
      metadata: { name: offer.name }
    }
  });

  revalidatePath("/offers");
  redirect("/offers");
}

export async function updateOffer(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const parsed = offerSchema.parse({
    name: formData.get("name"),
    targetAudience: formData.get("targetAudience"),
    valueProposition: formData.get("valueProposition"),
    ctaStyle: formData.get("ctaStyle"),
    aiVoiceRules: formData.get("aiVoiceRules")
  });

  const offer = await prisma.offer.update({
    where: { id },
    data: {
      ...parsed,
      painPoints: linesToArray(formData.get("painPoints")),
      proofPoints: linesToArray(formData.get("proofPoints")),
      servicesIncluded: linesToArray(formData.get("servicesIncluded")),
      disallowedClaims: linesToArray(formData.get("disallowedClaims"))
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "offer.updated",
      entityType: "offer",
      entityId: offer.id,
      metadata: { name: offer.name }
    }
  });

  revalidatePath("/offers");
  redirect("/offers");
}

export async function toggleOfferActive(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const active = z.enum(["true", "false"]).parse(formData.get("active")) === "true";

  await prisma.offer.update({
    where: { id },
    data: { active: !active }
  });

  await prisma.auditLog.create({
    data: {
      action: active ? "offer.deactivated" : "offer.activated",
      entityType: "offer",
      entityId: id
    }
  });

  revalidatePath("/offers");
}

export async function createSuppressionEntry(formData: FormData) {
  const email = normalizeEmail(formData.get("email"));
  const reason = z.nativeEnum(SuppressionReason).parse(formData.get("reason"));
  const notes = String(formData.get("notes") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address before adding suppression.");
  }

  const entry = await prisma.suppressionEntry.upsert({
    where: { email },
    update: {
      reason,
      notes: notes || null,
      source: source || "manual"
    },
    create: {
      email,
      reason,
      notes: notes || null,
      source: source || "manual"
    }
  });

  const lead = await prisma.lead.findUnique({ where: { email } });
  if (lead) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: LeadStatus.SUPPRESSED }
    });
    await prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        type: LeadEventType.SUPPRESSED,
        message: `Lead suppressed: ${reason}`,
        metadata: { suppressionEntryId: entry.id, source: source || "manual" }
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      action: "suppression.created",
      entityType: "suppression_entry",
      entityId: entry.id,
      metadata: { email, reason }
    }
  });

  revalidatePath("/suppression");
  revalidatePath("/leads");
  redirect("/suppression");
}

export async function updateLeadStatus(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const status = z.nativeEnum(LeadStatus).parse(formData.get("status"));

  const lead = await prisma.lead.update({
    where: { id },
    data: { status }
  });

  await prisma.leadEvent.create({
    data: {
      leadId: lead.id,
      type: LeadEventType.STATUS_CHANGED,
      message: `Status changed to ${status}`
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "lead.status_changed",
      entityType: "lead",
      entityId: lead.id,
      metadata: { status }
    }
  });

  revalidatePath("/leads");
}

export async function updateComplianceSettings(formData: FormData) {
  const parsed = complianceSettingsSchema.parse({
    senderName: formData.get("senderName"),
    senderEmail: formData.get("senderEmail"),
    physicalAddress: formData.get("physicalAddress"),
    unsubscribeUrl: formData.get("unsubscribeUrl")
  });

  await prisma.setting.upsert({
    where: { key: COMPLIANCE_SETTINGS_KEY },
    update: { value: parsed },
    create: { key: COMPLIANCE_SETTINGS_KEY, value: parsed }
  });

  await prisma.auditLog.create({
    data: {
      action: "settings.compliance_updated",
      entityType: "settings",
      entityId: COMPLIANCE_SETTINGS_KEY,
      metadata: { senderEmail: parsed.senderEmail }
    }
  });

  revalidatePath("/settings");
  revalidatePath("/campaigns");
}

export async function updateSendingAccount(formData: FormData) {
  const parsed = sendingAccountSchema.parse({
    id: String(formData.get("id") ?? "").trim() || undefined,
    name: formData.get("name"),
    fromName: formData.get("fromName"),
    fromEmail: formData.get("fromEmail"),
    replyTo: String(formData.get("replyTo") ?? "").trim(),
    host: String(formData.get("host") ?? "").trim(),
    port: formData.get("port"),
    secure: formData.get("secure") === "on",
    username: String(formData.get("username") ?? "").trim(),
    dryRun: formData.get("dryRun") === "on",
    dailyCap: formData.get("dailyCap"),
    perMinuteCap: formData.get("perMinuteCap"),
    perDomainDailyCap: formData.get("perDomainDailyCap"),
    minDelaySeconds: formData.get("minDelaySeconds")
  });

  const status = sendingAccountStatus(parsed);
  const domain = parsed.fromEmail.split("@")[1]?.toLowerCase();

  const account = await prisma.sendingAccount.upsert({
    where: { name: parsed.name },
    update: {
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      replyTo: parsed.replyTo || null,
      host: parsed.host || null,
      port: parsed.port,
      secure: parsed.secure,
      username: parsed.username || null,
      dryRun: parsed.dryRun,
      status,
      lastError: status === "NOT_CONFIGURED" ? "SMTP is missing host, username, or SMTP_PASS." : null
    },
    create: {
      name: parsed.name,
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      replyTo: parsed.replyTo || null,
      host: parsed.host || null,
      port: parsed.port,
      secure: parsed.secure,
      username: parsed.username || null,
      dryRun: parsed.dryRun,
      status,
      lastError: status === "NOT_CONFIGURED" ? "SMTP is missing host, username, or SMTP_PASS." : null,
      limits: {
        create: {
          dailyCap: parsed.dailyCap,
          perMinuteCap: parsed.perMinuteCap,
          perDomainDailyCap: parsed.perDomainDailyCap,
          minDelaySeconds: parsed.minDelaySeconds
        }
      }
    }
  });

  await prisma.sendingLimit.upsert({
    where: { sendingAccountId: account.id },
    update: {
      dailyCap: parsed.dailyCap,
      perMinuteCap: parsed.perMinuteCap,
      perDomainDailyCap: parsed.perDomainDailyCap,
      minDelaySeconds: parsed.minDelaySeconds
    },
    create: {
      sendingAccountId: account.id,
      dailyCap: parsed.dailyCap,
      perMinuteCap: parsed.perMinuteCap,
      perDomainDailyCap: parsed.perDomainDailyCap,
      minDelaySeconds: parsed.minDelaySeconds
    }
  });

  if (domain) {
    await prisma.sendingDomain.upsert({
      where: { sendingAccountId_domain: { sendingAccountId: account.id, domain } },
      update: {},
      create: { sendingAccountId: account.id, domain }
    });
  }

  await prisma.auditLog.create({
    data: {
      action: "sending_account.updated",
      entityType: "sending_account",
      entityId: account.id,
      metadata: { dryRun: parsed.dryRun, status }
    }
  });

  revalidatePath("/settings");
  revalidatePath("/campaigns");
}

export async function sendSendingAccountTest(formData: FormData) {
  const parsed = testEmailSchema.parse({
    sendingAccountId: formData.get("sendingAccountId"),
    to: formData.get("to")
  });

  const account = await prisma.sendingAccount.findUnique({ where: { id: parsed.sendingAccountId } });
  if (!account) throw new Error("Sending account not found.");

  await sendTestEmail({ account, to: parsed.to });

  await prisma.auditLog.create({
    data: {
      action: "sending_account.test_sent",
      entityType: "sending_account",
      entityId: account.id,
      metadata: { to: parsed.to, dryRun: account.dryRun }
    }
  });

  revalidatePath("/settings");
}

export async function updateSendingControl(formData: FormData) {
  const killSwitch = formData.get("killSwitch") === "on";

  await prisma.setting.upsert({
    where: { key: SENDING_CONTROL_SETTINGS_KEY },
    update: { value: { killSwitch } },
    create: { key: SENDING_CONTROL_SETTINGS_KEY, value: { killSwitch } }
  });

  if (killSwitch) {
    const activeJobs = await prisma.sendJob.findMany({
      where: { status: { in: [SendJobStatus.QUEUED, SendJobStatus.RUNNING] } },
      select: { id: true }
    });
    for (const job of activeJobs) {
      await pauseSendJob(job.id, "Global kill switch enabled by owner.");
    }
  }

  await prisma.auditLog.create({
    data: {
      action: "sending_control.updated",
      entityType: "settings",
      entityId: SENDING_CONTROL_SETTINGS_KEY,
      metadata: { killSwitch }
    }
  });

  revalidatePath("/settings");
  revalidatePath("/campaigns");
}

export async function updateAiAssistantSettingsWithState(
  _previousState: AiAssistantSettingsActionState,
  formData: FormData
): Promise<AiAssistantSettingsActionState> {
  const values = aiAssistantValuesFromFormData(formData);
  const parsed = aiAssistantFormSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Fix the highlighted AI settings before saving.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values,
      formKey: `error-${Date.now()}`
    };
  }

  const settings = settingsFromForm(parsed.data);

  await saveAiAssistantSettings(settings);
  await prisma.auditLog.create({
    data: {
      action: "ai_assistant.settings_updated",
      entityType: "settings",
      entityId: "ai_assistant_settings",
      metadata: {
        mode: settings.mode,
        ownerHotLeadEmail: settings.ownerHotLeadEmail,
        meetingBookedEmailEnabled: settings.notifications.meetingBookedEmail.enabled,
        meetingBookedEmailRecipient: settings.notifications.meetingBookedEmail.recipientEmail
      }
    }
  });

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/ai-assistant");

  return {
    status: "success",
    message: "AI Assistant settings saved.",
    fieldErrors: {},
    values,
    formKey: `success-${Date.now()}`
  };
}

export async function updateAiAssistantSettings(formData: FormData) {
  return updateAiAssistantSettingsWithState(
    { status: "idle", message: "", fieldErrors: {}, formKey: "initial" },
    formData
  );
}

function aiAssistantValuesFromFormData(formData: FormData): AiAssistantSettingsFormValues {
  return {
    enabled: formData.get("enabled") === "on",
    mode: String(formData.get("mode") ?? ""),
    ownerHotLeadEmail: String(formData.get("ownerHotLeadEmail") ?? ""),
    meetingBookedEmailEnabled: formData.get("meetingBookedEmailEnabled") === "on",
    meetingBookedEmailRecipient: String(formData.get("meetingBookedEmailRecipient") ?? ""),
    whatsappEnabled: formData.get("whatsappEnabled") === "on",
    whatsappAutoReply: formData.get("whatsappAutoReply") === "on",
    emailEnabled: formData.get("emailEnabled") === "on",
    emailAutoReply: formData.get("emailAutoReply") === "on",
    autoSendMinimum: String(formData.get("autoSendMinimum") ?? ""),
    draftMinimum: String(formData.get("draftMinimum") ?? ""),
    minReplyDelaySeconds: String(formData.get("minReplyDelaySeconds") ?? ""),
    maxReplyDelaySeconds: String(formData.get("maxReplyDelaySeconds") ?? ""),
    dailyAutoReplyCap: String(formData.get("dailyAutoReplyCap") ?? ""),
    businessRules: String(formData.get("businessRules") ?? ""),
    classifier: String(formData.get("classifier") ?? ""),
    whatsappReply: String(formData.get("whatsappReply") ?? ""),
    emailReply: String(formData.get("emailReply") ?? ""),
    safety: String(formData.get("safety") ?? ""),
    companyIntro: String(formData.get("companyIntro") ?? ""),
    services: String(formData.get("services") ?? ""),
    portfolioLinks: String(formData.get("portfolioLinks") ?? ""),
    pricingRules: String(formData.get("pricingRules") ?? ""),
    faqs: String(formData.get("faqs") ?? ""),
    forbiddenClaims: String(formData.get("forbiddenClaims") ?? "")
  };
}

export async function testAiAssistantReply(formData: FormData) {
  const parsed = aiAssistantTestSchema.parse({
    channel: formData.get("channel"),
    subject: String(formData.get("subject") ?? "").trim(),
    bodyText: formData.get("bodyText")
  });
  const result = await previewAiAssistantReply({
    channel: parsed.channel,
    subject: parsed.subject || "Test reply",
    bodyText: parsed.bodyText
  });

  await prisma.setting.upsert({
    where: { key: AI_ASSISTANT_LAST_TEST_KEY },
    update: { value: result as unknown as Prisma.InputJsonValue },
    create: { key: AI_ASSISTANT_LAST_TEST_KEY, value: result as unknown as Prisma.InputJsonValue }
  });
  await prisma.auditLog.create({
    data: {
      action: "ai_assistant.test_ran",
      entityType: "settings",
      entityId: AI_ASSISTANT_LAST_TEST_KEY,
      metadata: {
        channel: parsed.channel,
        intent: result.analysis.intent,
        confidence: result.analysis.confidence,
        shouldAutoSend: result.decision.shouldAutoSend
      }
    }
  });

  revalidatePath("/ai-assistant");
  redirect("/ai-assistant?tested=1");
}

export async function scheduleApprovedCampaign(formData: FormData) {
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const sendingAccountId = z.string().min(1).parse(formData.get("sendingAccountId"));

  const sendJobId = await scheduleCampaignSend(campaignId, sendingAccountId);

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}?sendJob=${sendJobId}`);
}

export async function pauseCampaignSending(formData: FormData) {
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const activeJobs = await prisma.sendJob.findMany({
    where: { campaignId, status: { in: [SendJobStatus.QUEUED, SendJobStatus.RUNNING] } },
    select: { id: true }
  });

  for (const job of activeJobs) {
    await pauseSendJob(job.id, "Paused by owner.");
  }

  await prisma.auditLog.create({
    data: {
      action: "campaign.paused",
      entityType: "campaign",
      entityId: campaignId
    }
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function resumeCampaignSending(formData: FormData) {
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const queue = emailQueue();
  const jobs = await prisma.sendJob.findMany({
    where: { campaignId, status: SendJobStatus.PAUSED },
    include: { messages: { where: { status: EmailMessageStatus.QUEUED } } }
  });

  for (const job of jobs) {
    await prisma.sendJob.update({
      where: { id: job.id },
      data: { status: SendJobStatus.QUEUED, pausedAt: null, lastError: null }
    });
    for (const message of job.messages) {
      await queue.add(
        "email.send",
        { messageId: message.id },
        { delay: Math.max(0, message.queuedAt.getTime() - Date.now()) }
      );
    }
  }

  await queue.close();
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.SCHEDULED }
  });

  await prisma.auditLog.create({
    data: {
      action: "campaign.resumed",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { resumedJobs: jobs.length }
    }
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function createCampaign(formData: FormData) {
  const parsed = campaignSchema.parse({
    name: formData.get("name"),
    offerId: formData.get("offerId"),
    objective: formData.get("objective"),
    status: formData.get("status"),
    tag: String(formData.get("tag") ?? "").trim() || undefined,
    country: String(formData.get("country") ?? "").trim() || undefined,
    maxRecipients: formData.get("maxRecipients")
  });

  const filter: AudienceFilter = {
    status: parsed.status,
    tag: parsed.tag,
    country: parsed.country,
    maxRecipients: parsed.maxRecipients
  };

  const offer = await prisma.offer.findUnique({ where: { id: parsed.offerId } });
  if (!offer || !offer.active) throw new Error("Select an active offer before creating a campaign.");

  const leads = await prisma.lead.findMany({
    where: audienceWhere(filter),
    orderBy: { createdAt: "desc" },
    take: filter.maxRecipients
  });

  const generated = await generateCampaignSequenceForOffer(offerForGeneration(offer), parsed.objective);

  const campaignId = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        name: parsed.name,
        objective: parsed.objective,
        offerId: parsed.offerId,
        audienceFilter: filter as unknown as Prisma.InputJsonObject,
        estimatedRecipients: leads.length,
        personalizationFields: generated.personalizationFieldsUsed,
        riskFlags: generated.riskFlags,
        claimsUsed: generated.claimsUsed,
        aiConfidence: generated.confidence,
        aiExplanation: generated.explanation,
        steps: {
          create: [
            {
              stepOrder: 1,
              delayDays: 0,
              subject: generated.subject,
              body: generated.body
            },
            ...generated.followUpSteps.map((step, index) => ({
              stepOrder: index + 2,
              delayDays: step.delayDays,
              subject: step.subject,
              body: step.body
            }))
          ]
        },
        variants: {
          create: {
            name: "Variant A",
            subject: generated.subject,
            body: generated.body
          }
        },
        recipients: {
          create: leads.map((lead) => ({
            leadId: lead.id,
            status: CampaignRecipientStatus.READY
          }))
        },
        aiGenerations: {
          create: {
            provider: generated.provider,
            model: generated.model,
            prompt: {
              offerId: offer.id,
              objective: parsed.objective,
              audienceFilter: filter
            },
            output: generated as unknown as Prisma.InputJsonObject,
            confidence: generated.confidence
          }
        }
      }
    });

    await replaceCampaignReview(campaign.id, tx);

    await tx.auditLog.create({
      data: {
        action: "campaign.created",
        entityType: "campaign",
        entityId: campaign.id,
        metadata: {
          offerId: offer.id,
          objective: parsed.objective,
          estimatedRecipients: leads.length
        }
      }
    });

    return campaign.id;
  });

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}`);
}

export async function updateCampaignContent(formData: FormData) {
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const stepIds = formData.getAll("stepId").map(String);
  const subjects = formData.getAll("subject").map(String);
  const bodies = formData.getAll("body").map(String);
  const delayDays = formData.getAll("delayDays").map((value) => Number(value));

  await prisma.$transaction(async (tx) => {
    for (const [index, stepId] of stepIds.entries()) {
      await tx.campaignStep.update({
        where: { id: stepId },
        data: {
          subject: subjects[index] ?? "",
          body: bodies[index] ?? "",
          delayDays: Number.isFinite(delayDays[index]) ? delayDays[index] : 0
        }
      });
    }

    await replaceCampaignReview(campaignId, tx);

    await tx.auditLog.create({
      data: {
        action: "campaign.content_updated",
        entityType: "campaign",
        entityId: campaignId
      }
    });
  });

  revalidatePath(`/campaigns/${campaignId}`);
}

export async function uploadCampaignEmailDesign(formData: FormData) {
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const name = String(formData.get("name") ?? "").trim();
  const file = formData.get("htmlFile");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Upload a self-contained .html file.");
  }
  if (!file.name.toLowerCase().endsWith(".html")) {
    throw new Error("Only .html files are supported for email designs.");
  }

  const html = await file.text();
  const prepared = prepareEmailDesignHtml(html);
  const displayName = name || file.name.replace(/\.html$/i, "");

  await prisma.$transaction(async (tx) => {
    await assertCampaignDesignEditable(tx, campaignId);

    const existingCount = await tx.emailDesignTemplate.count({ where: { campaignId } });
    if (existingCount >= MAX_EMAIL_DESIGNS_PER_CAMPAIGN) {
      throw new Error(`You can upload up to ${MAX_EMAIL_DESIGNS_PER_CAMPAIGN} email designs per campaign.`);
    }

    const template = await tx.emailDesignTemplate.create({
      data: {
        campaignId,
        name: displayName,
        originalHtml: html,
        sanitizedHtml: prepared.sanitizedHtml,
        status: prepared.status,
        warnings: prepared.warnings,
        errors: prepared.errors
      }
    });

    await replaceCampaignReview(campaignId, tx);
    await tx.auditLog.create({
      data: {
        action: "campaign.email_design_uploaded",
        entityType: "email_design_template",
        entityId: template.id,
        metadata: {
          campaignId,
          status: prepared.status,
          warnings: prepared.warnings,
          errors: prepared.errors
        }
      }
    });
  });

  revalidatePath(`/campaigns/${campaignId}`);
}

export async function selectCampaignEmailDesign(formData: FormData) {
  const parsed = emailDesignTemplateIdSchema.parse({
    campaignId: formData.get("campaignId"),
    templateId: formData.get("templateId")
  });

  await prisma.$transaction(async (tx) => {
    await assertCampaignDesignEditable(tx, parsed.campaignId);

    const template = await tx.emailDesignTemplate.findFirst({
      where: { id: parsed.templateId, campaignId: parsed.campaignId }
    });
    if (!template) throw new Error("Email design was not found.");
    if (template.status !== EmailDesignValidationStatus.VALID) {
      throw new Error("Fix this email design before selecting it.");
    }

    await tx.emailDesignTemplate.updateMany({
      where: { campaignId: parsed.campaignId },
      data: { selected: false }
    });
    await tx.emailDesignTemplate.update({
      where: { id: parsed.templateId },
      data: { selected: true }
    });
    await tx.campaign.update({
      where: { id: parsed.campaignId },
      data: { selectedEmailDesignTemplateId: parsed.templateId }
    });

    await replaceCampaignReview(parsed.campaignId, tx);
    await tx.auditLog.create({
      data: {
        action: "campaign.email_design_selected",
        entityType: "email_design_template",
        entityId: parsed.templateId,
        metadata: { campaignId: parsed.campaignId }
      }
    });
  });

  revalidatePath(`/campaigns/${parsed.campaignId}`);
}

export async function useDefaultCampaignEmailDesign(formData: FormData) {
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));

  await prisma.$transaction(async (tx) => {
    await assertCampaignDesignEditable(tx, campaignId);
    await tx.emailDesignTemplate.updateMany({ where: { campaignId }, data: { selected: false } });
    await tx.campaign.update({ where: { id: campaignId }, data: { selectedEmailDesignTemplateId: null } });
    await replaceCampaignReview(campaignId, tx);
    await tx.auditLog.create({
      data: {
        action: "campaign.email_design_default_selected",
        entityType: "campaign",
        entityId: campaignId
      }
    });
  });

  revalidatePath(`/campaigns/${campaignId}`);
}

export async function removeCampaignEmailDesign(formData: FormData) {
  const parsed = emailDesignTemplateIdSchema.parse({
    campaignId: formData.get("campaignId"),
    templateId: formData.get("templateId")
  });

  await prisma.$transaction(async (tx) => {
    await assertCampaignDesignEditable(tx, parsed.campaignId);
    const template = await tx.emailDesignTemplate.findFirst({
      where: { id: parsed.templateId, campaignId: parsed.campaignId }
    });
    if (!template) throw new Error("Email design was not found.");

    if (template.selected) {
      await tx.campaign.update({
        where: { id: parsed.campaignId },
        data: { selectedEmailDesignTemplateId: null }
      });
    }
    await tx.emailDesignTemplate.delete({ where: { id: parsed.templateId } });
    await replaceCampaignReview(parsed.campaignId, tx);
    await tx.auditLog.create({
      data: {
        action: "campaign.email_design_removed",
        entityType: "email_design_template",
        entityId: parsed.templateId,
        metadata: { campaignId: parsed.campaignId }
      }
    });
  });

  revalidatePath(`/campaigns/${parsed.campaignId}`);
}

export async function sendCampaignEmailDesignTest(formData: FormData) {
  const parsed = emailDesignTestSchema.parse({
    campaignId: formData.get("campaignId"),
    templateId: formData.get("templateId"),
    sendingAccountId: formData.get("sendingAccountId"),
    to: formData.get("to")
  });

  const [campaign, template, account, compliance] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: parsed.campaignId },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        recipients: { include: { lead: true }, take: 1 }
      }
    }),
    prisma.emailDesignTemplate.findFirst({
      where: { id: parsed.templateId, campaignId: parsed.campaignId }
    }),
    prisma.sendingAccount.findUnique({ where: { id: parsed.sendingAccountId } }),
    getComplianceSettings()
  ]);

  if (!campaign || !campaign.steps.length) throw new Error("Campaign email copy is missing.");
  if (!template) throw new Error("Email design was not found.");
  if (template.status !== EmailDesignValidationStatus.VALID) {
    throw new Error("Fix this email design before sending a test.");
  }
  if (!account) throw new Error("Sending account not found.");

  const sampleLead: Pick<Lead, "firstName" | "company" | "email"> = campaign.recipients[0]?.lead ?? {
    firstName: "there",
    company: "your company",
    email: parsed.to
  };
  const unsubscribeUrl = compliance.unsubscribeUrl || `${appBaseUrl()}/unsubscribe/test-preview`;
  const rendered = renderEmailCopy({
    subject: campaign.steps[0].subject,
    body: campaign.steps[0].body,
    lead: sampleLead,
    senderName: account.fromName,
    unsubscribeUrl
  });
  const html = renderCustomEmailHtml({
    designHtml: template.sanitizedHtml,
    account,
    subject: rendered.subject,
    text: rendered.bodyText,
    lead: sampleLead,
    unsubscribeUrl
  });

  await sendEmailDesignTest({
    account,
    to: parsed.to,
    subject: rendered.subject,
    text: rendered.bodyText,
    html,
    unsubscribeUrl
  });

  await prisma.auditLog.create({
    data: {
      action: "campaign.email_design_test_sent",
      entityType: "email_design_template",
      entityId: template.id,
      metadata: { campaignId: campaign.id, to: parsed.to, dryRun: account.dryRun }
    }
  });

  revalidatePath(`/campaigns/${parsed.campaignId}`);
}

export async function confirmCampaignLeadCompliance(formData: FormData) {
  const parsed = campaignLeadComplianceSchema.parse({
    campaignId: formData.get("campaignId"),
    source: formData.get("source"),
    country: formData.get("country"),
    legalBasis: formData.get("legalBasis"),
    confirmation: formData.get("confirmation")
  });
  if (parsed.confirmation !== "on") {
    revalidatePath(`/campaigns/${parsed.campaignId}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUnique({
      where: { id: parsed.campaignId },
      include: { recipients: { include: { lead: true } } }
    });
    if (!campaign) throw new Error("Campaign not found.");

    const leadsMissingCompliance = campaign.recipients
      .map((recipient) => recipient.lead)
      .filter((lead) => !lead.country || !lead.source || !lead.legalBasis);

    for (const lead of leadsMissingCompliance) {
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          country: lead.country || parsed.country,
          source: lead.source || parsed.source,
          legalBasis: lead.legalBasis || parsed.legalBasis
        }
      });
    }

    await replaceCampaignReview(parsed.campaignId, tx);

    await tx.auditLog.create({
      data: {
        action: "campaign.lead_compliance_confirmed",
        entityType: "campaign",
        entityId: parsed.campaignId,
        metadata: {
          updatedLeads: leadsMissingCompliance.length,
          source: parsed.source,
          country: parsed.country,
          legalBasis: parsed.legalBasis
        }
      }
    });
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${parsed.campaignId}`);
}

export async function approveCampaign(formData: FormData) {
  const campaignId = z.string().min(1).parse(formData.get("campaignId"));
  const items = await replaceCampaignReview(campaignId);

  if (items.some((item) => item.severity === CampaignReviewSeverity.BLOCK)) {
    revalidatePath(`/campaigns/${campaignId}`);
    return;
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: CampaignStatus.APPROVED,
      approvedAt: new Date()
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "campaign.approved",
      entityType: "campaign",
      entityId: campaignId
    }
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function rescheduleCampaignQueuedEmails(formData: FormData) {
  const parsed = campaignTimingSchema.parse({
    campaignId: formData.get("campaignId"),
    startAt: formData.get("startAt"),
    spacingSeconds: formData.get("spacingSeconds")
  });
  const startAt = parseKuwaitDateTimeLocal(parsed.startAt);
  const stepIds = formData.getAll("stepId").map(String);
  const stepDelayDays = formData.getAll("stepDelayDays").map((value) => Number(value));
  const delayByStepId = new Map<string, number>();
  for (const [index, stepId] of stepIds.entries()) {
    const delayDays = Number.isFinite(stepDelayDays[index])
      ? Math.max(0, Math.min(30, Math.round(stepDelayDays[index])))
      : 0;
    delayByStepId.set(stepId, delayDays);
  }

  const queue = emailQueue();

  const queuedMessages = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUnique({
      where: { id: parsed.campaignId },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        recipients: { orderBy: { createdAt: "asc" } },
        sendJobs: {
          where: { status: { in: [SendJobStatus.QUEUED, SendJobStatus.RUNNING, SendJobStatus.PAUSED] } },
          include: {
            messages: {
              where: { status: EmailMessageStatus.QUEUED },
              include: { campaignRecipient: true, campaignStep: true }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!campaign) throw new Error("Campaign not found.");
    const activeJob = campaign.sendJobs[0];
    if (!activeJob) throw new Error("No active send job found for this campaign.");

    for (const step of campaign.steps) {
      await tx.campaignStep.update({
        where: { id: step.id },
        data: { delayDays: delayByStepId.get(step.id) ?? step.delayDays }
      });
    }

    const recipientOrder = new Map(campaign.recipients.map((recipient, index) => [recipient.id, index]));
    const updates: Array<{ id: string; queuedAt: Date }> = [];

    for (const message of activeJob.messages) {
      const recipientIndex = recipientOrder.get(message.campaignRecipientId) ?? 0;
      const delayDays = delayByStepId.get(message.campaignStepId) ?? message.campaignStep.delayDays ?? 0;
      const queuedAt = new Date(
        startAt.getTime() + delayDays * 24 * 60 * 60 * 1000 + recipientIndex * parsed.spacingSeconds * 1000
      );
      updates.push({ id: message.id, queuedAt });
    }

    for (const update of updates) {
      await tx.emailMessage.update({
        where: { id: update.id },
        data: { queuedAt: update.queuedAt, error: null }
      });
    }

    await tx.auditLog.create({
      data: {
        action: "campaign.queued_timing_updated",
        entityType: "campaign",
        entityId: parsed.campaignId,
        metadata: {
          sendJobId: activeJob.id,
          updatedMessages: updates.length,
          startAt: startAt.toISOString(),
          spacingSeconds: parsed.spacingSeconds,
          stepDelays: Object.fromEntries(delayByStepId)
        }
      }
    });

    return updates;
  });

  for (const message of queuedMessages) {
    await queue.add(
      "email.send",
      { messageId: message.id },
      { delay: Math.max(0, message.queuedAt.getTime() - Date.now()) }
    );
  }
  await queue.close();

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${parsed.campaignId}`);
}

export async function createManualInboundReply(formData: FormData) {
  const parsed = manualReplySchema.parse({
    fromEmail: formData.get("fromEmail"),
    toEmail: String(formData.get("toEmail") ?? "").trim(),
    subject: formData.get("subject"),
    bodyText: formData.get("bodyText")
  });

  const result = await ingestInboundReply({
    fromEmail: parsed.fromEmail,
    toEmail: parsed.toEmail || null,
    subject: parsed.subject,
    bodyText: parsed.bodyText,
    source: "manual"
  });

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  redirect(`/inbox?selected=${result.reply.id}`);
}

export async function reprocessInboundReply(formData: FormData) {
  const parsed = replyIdSchema.parse({
    replyId: formData.get("replyId")
  });

  const reply = await processInboundReply(parsed.replyId);

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  redirect(`/inbox?selected=${reply.id}`);
}

export async function sendAiReplyDraftAction(formData: FormData) {
  const parsed = aiReplyDraftSchema.parse({
    draftId: formData.get("draftId"),
    replyId: formData.get("replyId"),
    sendingAccountId: String(formData.get("sendingAccountId") ?? "").trim(),
    returnTo: String(formData.get("returnTo") ?? "").trim()
  });

  await sendAiReplyDraft(parsed.draftId, parsed.sendingAccountId || undefined);

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  revalidatePath("/whatsapp/inbox");
  redirect(parsed.returnTo || `/inbox?selected=${parsed.replyId}`);
}

export async function pauseAiForLeadAction(formData: FormData) {
  const parsed = leadAiControlSchema.parse({
    leadId: formData.get("leadId"),
    replyId: String(formData.get("replyId") ?? "").trim(),
    returnTo: String(formData.get("returnTo") ?? "").trim()
  });

  await pauseAiForLead(parsed.leadId);

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/whatsapp/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/ai-assistant");
  redirect(parsed.returnTo || `/inbox${parsed.replyId ? `?selected=${parsed.replyId}` : ""}`);
}

export async function resumeAiForLeadAction(formData: FormData) {
  const parsed = leadAiControlSchema.parse({
    leadId: formData.get("leadId"),
    replyId: String(formData.get("replyId") ?? "").trim(),
    returnTo: String(formData.get("returnTo") ?? "").trim()
  });

  await resumeAiForLead(parsed.leadId);

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/whatsapp/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/ai-assistant");
  redirect(parsed.returnTo || `/inbox${parsed.replyId ? `?selected=${parsed.replyId}` : ""}`);
}

export async function markInboundReplyHot(formData: FormData) {
  const parsed = replyIdSchema.parse({
    replyId: formData.get("replyId")
  });

  await markReplyAsHot(parsed.replyId);

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  redirect(`/inbox?selected=${parsed.replyId}`);
}

export async function closeInboundReply(formData: FormData) {
  const parsed = replyIdSchema.parse({
    replyId: formData.get("replyId")
  });

  await markReplyOwnerReviewed(parsed.replyId);

  revalidatePath("/inbox");
  redirect(`/inbox?selected=${parsed.replyId}`);
}

export async function createMeetingSlot(formData: FormData) {
  const parsed = meetingSlotSchema.parse({
    startAt: formData.get("startAt"),
    durationMinutes: formData.get("durationMinutes"),
    timezone: String(formData.get("timezone") ?? "Asia/Kuwait").trim() || "Asia/Kuwait",
    notes: String(formData.get("notes") ?? "").trim()
  });
  const startAt = parseManualSlotDate(parsed.startAt, parsed.timezone);
  const endAt = new Date(startAt.getTime() + parsed.durationMinutes * 60_000);

  await prisma.meetingSlot.create({
    data: {
      startAt,
      endAt,
      timezone: parsed.timezone,
      notes: parsed.notes || null
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "meeting_slot.created",
      entityType: "meeting_slot",
      metadata: { startAt: startAt.toISOString(), endAt: endAt.toISOString(), timezone: parsed.timezone }
    }
  });

  revalidatePath("/ai-assistant");
}

export async function generateDefaultMeetingAvailabilityAction() {
  await generateDefaultMeetingAvailability();

  revalidatePath("/ai-assistant");
  revalidatePath("/inbox");
  revalidatePath("/whatsapp/inbox");
}

export async function updateMeetingSlotStatus(formData: FormData) {
  const parsed = meetingSlotStatusSchema.parse({
    slotId: formData.get("slotId"),
    status: formData.get("status")
  });

  await prisma.meetingSlot.update({
    where: { id: parsed.slotId },
    data: {
      status: parsed.status,
      bookedLeadId: parsed.status === MeetingSlotStatus.AVAILABLE ? null : undefined
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "meeting_slot.status_updated",
      entityType: "meeting_slot",
      entityId: parsed.slotId,
      metadata: { status: parsed.status }
    }
  });

  revalidatePath("/ai-assistant");
  revalidatePath("/inbox");
  revalidatePath("/whatsapp/inbox");
}

export async function bookMeetingSlotForReply(formData: FormData) {
  const parsed = bookMeetingSlotSchema.parse({
    replyId: formData.get("replyId"),
    slotId: formData.get("slotId"),
    returnTo: String(formData.get("returnTo") ?? "").trim()
  });
  const reply = await prisma.inboundReply.findUnique({
    where: { id: parsed.replyId },
    include: { lead: true, conversation: true }
  });
  if (!reply?.lead) throw new Error("Reply is not linked to a lead.");

  const slot = await prisma.meetingSlot.findUnique({ where: { id: parsed.slotId } });
  if (!slot || slot.status !== MeetingSlotStatus.AVAILABLE) {
    throw new Error("This meeting slot is no longer available.");
  }

  const bookingId = await prisma.$transaction(async (tx) => {
    await tx.meetingSlot.update({
      where: { id: slot.id },
      data: {
        status: MeetingSlotStatus.BOOKED,
        bookedLeadId: reply.lead!.id
      }
    });
    const booking = await tx.meetingBooking.create({
      data: {
        leadId: reply.lead!.id,
        conversationId: reply.conversationId,
        slotId: slot.id,
        status: MeetingBookingStatus.CONFIRMED,
        contactName: [reply.lead!.firstName, reply.lead!.lastName].filter(Boolean).join(" ") || null,
        phoneE164: reply.lead!.phoneE164,
        email: reply.lead!.email,
        company: reply.lead!.company,
        serviceNeeded: reply.lead!.serviceNeeded,
        preferredTimeText: `${slot.startAt.toISOString()} ${slot.timezone}`,
        confirmedAt: new Date()
      }
    });
    await tx.lead.update({
      where: { id: reply.lead!.id },
      data: {
        status: LeadStatus.HOT,
        salesStage: SalesLeadStage.MEETING_BOOKED,
        nextActionAt: slot.startAt,
        scoreIntent: Math.max(reply.lead!.scoreIntent, 100),
        scoreEngagement: Math.max(reply.lead!.scoreEngagement, 90)
      }
    });
    if (reply.conversationId) {
      await tx.conversation.update({
        where: { id: reply.conversationId },
        data: {
          stage: SalesLeadStage.MEETING_BOOKED,
          status: "OWNER_HANDOFF",
          ownerHandoffRequired: true,
          scoreIntent: 100,
          totalScore: 100,
          lastMessageAt: new Date()
        }
      });
    }
    await tx.inboundReply.update({
      where: { id: reply.id },
      data: {
        salesStage: SalesLeadStage.MEETING_BOOKED,
        ownerActionRequired: true,
        aiSuggestedAction: "Meeting booked. Owner should prepare and join/confirm the call."
      }
    });
    await tx.leadEvent.create({
      data: {
        leadId: reply.lead!.id,
        type: LeadEventType.STATUS_CHANGED,
        message: "Meeting booked from AI inbox.",
        metadata: { replyId: reply.id, slotId: slot.id, startAt: slot.startAt.toISOString() }
      }
    });
    await tx.auditLog.create({
      data: {
        action: "meeting_booking.confirmed",
        entityType: "inbound_reply",
        entityId: reply.id,
        metadata: { leadId: reply.lead!.id, slotId: slot.id, startAt: slot.startAt.toISOString() }
      }
    });
    return booking.id;
  });

  await sendMeetingBookedOwnerAlert(bookingId);

  revalidatePath("/");
  revalidatePath("/ai-assistant");
  revalidatePath("/inbox");
  revalidatePath("/whatsapp/inbox");
  revalidatePath("/pipeline");
  redirect(parsed.returnTo || `/inbox?selected=${parsed.replyId}`);
}

export async function updatePipelineDealStage(formData: FormData) {
  const parsed = dealStageSchema.parse({
    dealId: formData.get("dealId"),
    stage: formData.get("stage"),
    notes: String(formData.get("notes") ?? "").trim()
  });

  await updateDealStage(parsed.dealId, parsed.stage, parsed.notes);

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
}

export async function rollbackImportBatch(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));

  const batch = await prisma.importBatch.findUnique({
    where: { id },
    include: {
      rows: {
        where: {
          leadId: { not: null },
          status: { in: [ImportRowStatus.IMPORTED, ImportRowStatus.FLAGGED] }
        },
        select: { id: true, leadId: true }
      }
    }
  });

  if (!batch) {
    throw new Error("Import batch not found.");
  }

  if (batch.rolledBackAt) {
    revalidatePath(`/leads/import/${id}`);
    return;
  }

  const leadIds = batch.rows.map((row) => row.leadId).filter(Boolean) as string[];
  const rowIds = batch.rows.map((row) => row.id);

  await prisma.$transaction(async (tx) => {
    if (rowIds.length) {
      await tx.importRow.updateMany({
        where: { id: { in: rowIds } },
        data: {
          status: ImportRowStatus.ROLLED_BACK,
          issues: ["Rolled back by owner"],
          leadId: null
        }
      });
    }

    if (leadIds.length) {
      await tx.lead.deleteMany({
        where: { id: { in: leadIds } }
      });
    }

    await tx.importBatch.update({
      where: { id },
      data: {
        rolledBackRows: leadIds.length,
        rolledBackAt: new Date()
      }
    });

    await tx.auditLog.create({
      data: {
        action: "import.rolled_back",
        entityType: "import_batch",
        entityId: id,
        metadata: {
          filename: batch.filename,
          rolledBackRows: leadIds.length
        }
      }
    });
  });

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/import/${id}`);
}

export async function saveWhatsappTemplate(formData: FormData) {
  const parsed = whatsappTemplateSchema.parse({
    id: String(formData.get("id") ?? "").trim() || undefined,
    name: formData.get("name"),
    metaTemplateName: formData.get("metaTemplateName"),
    language: String(formData.get("language") ?? "en").trim() || "en",
    category: formData.get("category"),
    status: formData.get("status"),
    bodyPreview: String(formData.get("bodyPreview") ?? "").trim(),
    active: formData.get("active") === "on"
  });
  const variables = parseTemplateVariables(formData.get("variables"));

  const template = await prisma.whatsappTemplate.upsert({
    where: { metaTemplateName: parsed.metaTemplateName },
    update: {
      name: parsed.name,
      metaTemplateName: parsed.metaTemplateName,
      language: parsed.language,
      category: parsed.category,
      status: parsed.status,
      variables,
      bodyPreview: parsed.bodyPreview || null,
      active: parsed.active
    },
    create: {
      name: parsed.name,
      metaTemplateName: parsed.metaTemplateName,
      language: parsed.language,
      category: parsed.category,
      status: parsed.status,
      variables,
      bodyPreview: parsed.bodyPreview || null,
      active: parsed.active
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "whatsapp_template.saved",
      entityType: "whatsapp_template",
      entityId: template.id,
      metadata: { metaTemplateName: template.metaTemplateName, variables }
    }
  });

  revalidatePath("/whatsapp");
  revalidatePath("/whatsapp/templates");
  redirect("/whatsapp/templates");
}

export async function sendWhatsappTemplateTest(formData: FormData) {
  const templateId = z.string().min(1).parse(formData.get("templateId"));
  const phoneResult = z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .safeParse(String(formData.get("toPhoneE164") ?? "").trim());
  if (!phoneResult.success) {
    redirect(
      "/whatsapp/templates?testError=Enter%20the%20test%20phone%20in%20international%20format%2C%20for%20example%20%2B96560000000."
    );
  }
  const toPhoneE164 = phoneResult.data;
  const template = await prisma.whatsappTemplate.findUnique({ where: { id: templateId } });
  if (!template) {
    redirect("/whatsapp/templates?testError=WhatsApp%20template%20not%20found.");
  }

  const contentVariables = Object.fromEntries(
    template.variables.map((variable) => [variable, String(formData.get(`testVar:${variable}`) ?? "Test")])
  );
  let result: Awaited<ReturnType<typeof sendMetaTemplateMessage>>;
  try {
    result = await sendMetaTemplateMessage({
      toPhoneE164,
      templateName: template.metaTemplateName,
      language: template.language,
      contentVariables
    });
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "Meta test send failed.");
    redirect(`/whatsapp/templates?testError=${message}`);
  }

  await prisma.whatsappEvent.create({
    data: {
      type: WhatsappEventType.TEST_SENT,
      metadata: {
        templateId,
        toPhoneE164,
        providerMessageId: result.providerMessageId,
        dryRun: result.dryRun
      }
    }
  });

  revalidatePath("/whatsapp/templates");
  redirect(
    "/whatsapp/templates?testOk=WhatsApp%20test%20send%20recorded.%20Check%20test%20mode%20or%20WhatsApp%20logs."
  );
}

export async function submitWhatsappTemplateToMeta(formData: FormData) {
  const templateId = z.string().min(1).parse(formData.get("templateId"));
  const template = await prisma.whatsappTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error("WhatsApp template not found.");

  const exampleVariables = (template.exampleVariables || {}) as Record<string, string>;
  const result = await submitMetaTemplateForApproval({
    name: template.metaTemplateName,
    language: template.language,
    category: template.category,
    bodyText: template.bodyPreview || "",
    exampleVariables
  });

  await prisma.whatsappTemplate.update({
    where: { id: template.id },
    data: {
      metaTemplateId: result.metaTemplateId,
      status: result.status
    }
  });
  await prisma.auditLog.create({
    data: {
      action: "whatsapp_template.submitted_to_meta",
      entityType: "whatsapp_template",
      entityId: template.id,
      metadata: { dryRun: result.dryRun, metaTemplateId: result.metaTemplateId, status: result.status }
    }
  });

  revalidatePath("/whatsapp/templates");
}

export async function syncWhatsappTemplateFromMeta(formData: FormData) {
  const templateId = z.string().min(1).parse(formData.get("templateId"));
  const template = await prisma.whatsappTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error("WhatsApp template not found.");

  const result = await syncMetaTemplateStatus({
    templateName: template.metaTemplateName,
    language: template.language
  });

  await prisma.whatsappTemplate.update({
    where: { id: template.id },
    data: {
      metaTemplateId: result.metaTemplateId || template.metaTemplateId,
      status: result.status
    }
  });
  await prisma.auditLog.create({
    data: {
      action: "whatsapp_template.synced_from_meta",
      entityType: "whatsapp_template",
      entityId: template.id,
      metadata: { dryRun: result.dryRun, metaTemplateId: result.metaTemplateId, status: result.status }
    }
  });

  revalidatePath("/whatsapp/templates");
}

export async function createWhatsappCampaign(formData: FormData) {
  const parsed = whatsappCampaignSchema.parse({
    name: formData.get("name"),
    offerId: String(formData.get("offerId") ?? "").trim() || undefined,
    templateId: formData.get("templateId"),
    status: formData.get("status"),
    tag: String(formData.get("tag") ?? "").trim() || undefined,
    country: String(formData.get("country") ?? "").trim() || undefined,
    maxRecipients: formData.get("maxRecipients"),
    dailyCap: formData.get("dailyCap"),
    sendWindowStart: String(formData.get("sendWindowStart") ?? "").trim() || undefined,
    sendWindowEnd: String(formData.get("sendWindowEnd") ?? "").trim() || undefined
  });
  if (formData.get("ownerApproval") !== "on") {
    throw new Error("Owner approval checkbox is required before creating a WhatsApp send campaign.");
  }

  const filter: WhatsappAudienceFilter = {
    status: parsed.status,
    tag: parsed.tag,
    country: parsed.country,
    maxRecipients: parsed.maxRecipients
  };
  const [offer, template] = await Promise.all([
    parsed.offerId
      ? prisma.offer.findUnique({ where: { id: parsed.offerId } })
      : prisma.offer.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    prisma.whatsappTemplate.findUnique({ where: { id: parsed.templateId } })
  ]);
  if (!offer || !offer.active) {
    throw new Error("Add one active service internally before creating a WhatsApp campaign.");
  }
  if (!template || !template.active) throw new Error("Select an active WhatsApp template.");

  const variableMapping = Object.fromEntries(
    template.variables.map((variable) => [variable, String(formData.get(`var:${variable}`) ?? "firstName")])
  );
  const leads = await prisma.lead.findMany({
    where: whatsappAudienceWhere(filter),
    orderBy: { createdAt: "desc" },
    take: filter.maxRecipients
  });
  const reviewBlocked = template.status !== WhatsappTemplateStatus.APPROVED || leads.length === 0;

  const campaign = await prisma.whatsappCampaign.create({
    data: {
      name: parsed.name,
      status: reviewBlocked ? WhatsappCampaignStatus.REVIEW_BLOCKED : WhatsappCampaignStatus.REVIEW_READY,
      offerId: offer.id,
      templateId: parsed.templateId,
      audienceFilter: filter as unknown as Prisma.InputJsonObject,
      variableMapping: variableMapping as Prisma.InputJsonObject,
      estimatedRecipients: leads.length,
      dailyCap: parsed.dailyCap,
      sendWindowStart: parsed.sendWindowStart || null,
      sendWindowEnd: parsed.sendWindowEnd || null,
      recipients: {
        create: leads.map((lead) => ({
          leadId: lead.id,
          status: "READY"
        }))
      }
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "whatsapp_campaign.created",
      entityType: "whatsapp_campaign",
      entityId: campaign.id,
      metadata: {
        templateId: template.id,
        offerId: offer.id,
        estimatedRecipients: leads.length,
        reviewBlocked
      }
    }
  });

  revalidatePath("/whatsapp");
  redirect(`/whatsapp/campaigns/${campaign.id}`);
}

export async function approveWhatsappCampaign(formData: FormData) {
  const parsed = whatsappCampaignIdSchema.parse({ campaignId: formData.get("campaignId") });
  const campaign = await prisma.whatsappCampaign.findUnique({
    where: { id: parsed.campaignId },
    include: { template: true, recipients: true }
  });
  if (!campaign) throw new Error("WhatsApp campaign not found.");
  if (campaign.template.status !== WhatsappTemplateStatus.APPROVED || !campaign.template.active) {
    throw new Error("The selected WhatsApp template must be active and approved.");
  }
  if (!campaign.recipients.length) {
    throw new Error("Campaign has no eligible opted-in WhatsApp recipients.");
  }

  await prisma.whatsappCampaign.update({
    where: { id: campaign.id },
    data: { status: WhatsappCampaignStatus.APPROVED, approvedAt: new Date() }
  });
  await prisma.auditLog.create({
    data: {
      action: "whatsapp_campaign.approved",
      entityType: "whatsapp_campaign",
      entityId: campaign.id
    }
  });

  revalidatePath("/whatsapp");
  revalidatePath(`/whatsapp/campaigns/${campaign.id}`);
}

export async function scheduleApprovedWhatsappCampaign(formData: FormData) {
  const parsed = whatsappCampaignIdSchema.parse({ campaignId: formData.get("campaignId") });
  const sendJobId = await scheduleWhatsappCampaignSend(parsed.campaignId);

  revalidatePath("/whatsapp");
  revalidatePath(`/whatsapp/campaigns/${parsed.campaignId}`);
  redirect(`/whatsapp/campaigns/${parsed.campaignId}?sendJob=${sendJobId}`);
}

export async function pauseWhatsappCampaignSending(formData: FormData) {
  const parsed = whatsappCampaignIdSchema.parse({ campaignId: formData.get("campaignId") });
  const activeJobs = await prisma.whatsappSendJob.findMany({
    where: { campaignId: parsed.campaignId, status: { in: [SendJobStatus.QUEUED, SendJobStatus.RUNNING] } },
    select: { id: true }
  });

  for (const job of activeJobs) {
    await pauseWhatsappSendJob(job.id, "Paused by owner.");
  }
  await prisma.whatsappCampaign.update({
    where: { id: parsed.campaignId },
    data: { status: WhatsappCampaignStatus.PAUSED }
  });

  revalidatePath("/whatsapp");
  revalidatePath(`/whatsapp/campaigns/${parsed.campaignId}`);
}

export async function resumeWhatsappCampaignSending(formData: FormData) {
  const parsed = whatsappCampaignIdSchema.parse({ campaignId: formData.get("campaignId") });
  const queue = whatsappQueue();
  const jobs = await prisma.whatsappSendJob.findMany({
    where: { campaignId: parsed.campaignId, status: SendJobStatus.PAUSED },
    include: { messages: { where: { status: WhatsappMessageStatus.QUEUED } } }
  });

  for (const job of jobs) {
    await prisma.whatsappSendJob.update({
      where: { id: job.id },
      data: { status: SendJobStatus.QUEUED, pausedAt: null, lastError: null }
    });
    for (const message of job.messages) {
      await queue.add(
        "whatsapp.send",
        { messageId: message.id },
        { delay: Math.max(0, message.queuedAt.getTime() - Date.now()) }
      );
    }
  }

  await queue.close();
  await prisma.whatsappCampaign.update({
    where: { id: parsed.campaignId },
    data: { status: WhatsappCampaignStatus.SCHEDULED }
  });

  revalidatePath("/whatsapp");
  revalidatePath(`/whatsapp/campaigns/${parsed.campaignId}`);
}
