"use server";

import {
  CampaignObjective,
  CampaignRecipientStatus,
  CampaignReviewSeverity,
  CampaignStatus,
  DealStage,
  DealStatus,
  AiReplyDraftStatus,
  EmailDesignValidationStatus,
  EmailMessageStatus,
  ImportRowStatus,
  LeadEventType,
  LeadStatus,
  MeetingBookingStatus,
  MeetingSlotStatus,
  MessageChannel,
  Prisma,
  ReplyIntent,
  ReplySentiment,
  ReplyStatus,
  SalesLeadStage,
  SendJobStatus,
  SuppressionReason,
  WebsiteAuditCandidateStatus,
  WebsiteAuditRunStatus,
  WhatsappCampaignStatus,
  WhatsappEventType,
  WhatsappTemplateCategory,
  WhatsappTemplateStatus,
  WhatsappMessageStatus,
  WhatsappRecipientStatus,
  type Lead
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  campaignHasBlockers,
  generateCampaignSequenceForOffer,
  reviewCampaign,
  type OfferForGeneration
} from "@/lib/campaigns";
import {
  blockedLeadStatuses,
  emailAudienceWhere,
  type LeadAudienceFilter
} from "@/lib/audience";
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
  updateDealStage,
  isSystemOrMarketingReply
} from "@/lib/replies";
import {
  AI_ASSISTANT_LAST_TEST_KEY,
  aiAssistantFormSchema,
  saveAiAssistantSettings,
  sendMeetingBookedOwnerAlert,
  settingsFromForm
} from "@/lib/ai-assistant";
import {
  EMAIL_DESIGN_SAMPLE_BODY,
  EMAIL_DESIGN_SAMPLE_LEAD,
  EMAIL_DESIGN_SAMPLE_SUBJECT,
  ensureBuiltInEmailDesignTemplate,
  renderEmailDesignTemplateHtml
} from "@/lib/email-design-template-library";
import { MAX_EMAIL_DESIGN_BYTES, prepareEmailDesignHtml } from "@/lib/email-designs";
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
import {
  DEFAULT_WEBSITE_AUDIT_LEGAL_BASIS,
  DEFAULT_WEBSITE_AUDIT_SOURCE,
  WEBSITE_AUDIT_MAX_PAGES,
  WEBSITE_AUDIT_MAX_URLS,
  campaignStepForWebsiteAudit,
  dedupeWebsiteRows,
  parseWebsiteRows,
  queueWebsiteAuditRun,
  refreshWebsiteAuditRunCounts,
  websiteAuditPersonalization
} from "@/lib/website-audit";

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
  groupId: z.string().optional(),
  maxRecipients: z.coerce.number().int().min(1).max(5000)
});

const websiteAuditOfferSchema = z.object({
  name: z.string().min(3),
  targetAudience: z.string().min(5),
  valueProposition: z.string().min(5),
  returnTo: z.string().optional().or(z.literal(""))
});

const websiteAuditRunSchema = z.object({
  name: z.string().min(3),
  selectedOfferId: z.string().min(1),
  websitesText: z.string().optional().or(z.literal("")),
  country: z.string().min(2),
  source: z.string().optional().or(z.literal("")),
  legalBasis: z.string().optional().or(z.literal("")),
  maxPagesPerSite: z.coerce.number().int().min(1).max(WEBSITE_AUDIT_MAX_PAGES)
});

const websiteAuditCandidateSchema = z.object({
  candidateId: z.string().min(1),
  decision: z.enum(["SAVE", "APPROVE", "REJECT"]),
  companyName: z.string().optional().or(z.literal("")),
  email: z.string().optional().or(z.literal("")),
  recommendedServiceName: z.string().optional().or(z.literal("")),
  mobileAppScore: z.coerce.number().int().min(0).max(100),
  painPoints: z.string().optional().or(z.literal("")),
  missingFeatures: z.string().optional().or(z.literal("")),
  mobileAppSignals: z.string().optional().or(z.literal("")),
  generatedSubject: z.string().optional().or(z.literal("")),
  generatedBody: z.string().optional().or(z.literal(""))
});

const websiteAuditRunIdSchema = z.object({
  runId: z.string().min(1),
  campaignName: z.string().min(3).optional()
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
  templateId: z.string().optional().or(z.literal(""))
});

const emailDesignTestSchema = z.object({
  campaignId: z.string().min(1),
  templateId: z.string().optional().or(z.literal("")),
  sendingAccountId: z.string().min(1),
  to: z.string().email()
});

const globalEmailDesignTestSchema = z.object({
  templateId: z.string().min(1),
  sendingAccountId: z.string().min(1),
  to: z.string().email()
});

const emailDesignTemplateCreateSchema = z.object({
  name: z.string().trim().min(3, "Template name must be at least 3 characters.").max(90),
  description: z.string().trim().max(320, "Description must be 320 characters or less.").optional(),
  html: z.string().trim().min(20, "Paste HTML or upload a self-contained .html file.")
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

const deleteReplySchema = z.object({
  replyId: z.string().min(1),
  returnTo: z.string().optional().or(z.literal("")),
  deleteLinkedLead: z.preprocess((value) => value === "on" || value === "true", z.boolean()).default(false)
});

const deleteCampaignSchema = z.object({
  campaignId: z.string().min(1),
  returnTo: z.string().optional().or(z.literal(""))
});

const deleteLeadSchema = z.object({
  leadId: z.string().min(1),
  returnTo: z.string().optional().or(z.literal("")),
  reason: z.string().optional().or(z.literal(""))
});

const removeHotLeadSchema = z.object({
  dealId: z.string().min(1),
  returnTo: z.string().optional().or(z.literal("")),
  deleteLinkedLead: z.preprocess((value) => value === "on" || value === "true", z.boolean()).default(false)
});

const leadGroupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  leadIds: z.array(z.string()).default([])
});

const addLeadGroupMembersSchema = z.object({
  groupId: z.string().min(1),
  leadIds: z.array(z.string()).min(1)
});

const removeLeadGroupMemberSchema = z.object({
  groupId: z.string().min(1),
  leadId: z.string().min(1)
});

const deleteLeadGroupSchema = z.object({
  groupId: z.string().min(1)
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
  groupId: z.string().optional(),
  maxRecipients: z.coerce.number().int().min(1).max(5000),
  dailyCap: z.coerce.number().int().min(1).max(500),
  sendWindowStart: z.string().optional(),
  sendWindowEnd: z.string().optional()
});

const whatsappCampaignIdSchema = z.object({
  campaignId: z.string().min(1)
});

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

export type EmailDesignTemplateFormValues = {
  name: string;
  description: string;
  html: string;
};

export type EmailDesignTemplateActionState = {
  status: "idle" | "success" | "error" | "warning";
  message: string;
  fieldErrors: Record<string, string[]>;
  values?: EmailDesignTemplateFormValues;
  formKey: string;
};

function offerForGeneration(offer: OfferForGeneration) {
  return offer;
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

async function softDeleteLead(
  tx: Prisma.TransactionClient | typeof prisma,
  leadId: string,
  reason = "Removed by operator"
) {
  const existing = await tx.lead.findUnique({
    where: { id: leadId },
    select: { id: true, email: true, phoneE164: true, company: true, deletedAt: true }
  });
  if (!existing) throw new Error("Lead not found.");

  const deletedAt = existing.deletedAt ?? new Date();
  const deletedReason = reason.trim() || "Removed by operator";

  await tx.lead.update({
    where: { id: leadId },
    data: {
      deletedAt,
      deletedReason,
      status: LeadStatus.SUPPRESSED,
      aiAutoReplyPaused: true,
      aiAutoReplyPausedAt: new Date(),
      aiAutoReplyPauseReason: "Lead was removed from active outreach."
    }
  });

  await tx.emailMessage.updateMany({
    where: {
      leadId,
      status: { in: [EmailMessageStatus.QUEUED, EmailMessageStatus.SENDING] }
    },
    data: {
      status: EmailMessageStatus.SKIPPED,
      skippedAt: new Date(),
      error: "Lead was removed from active outreach."
    }
  });

  await tx.campaignRecipient.updateMany({
    where: {
      leadId,
      status: { in: [CampaignRecipientStatus.DRAFT, CampaignRecipientStatus.READY, CampaignRecipientStatus.QUEUED] }
    },
    data: {
      status: CampaignRecipientStatus.SKIPPED,
      reason: "Lead was removed from active outreach."
    }
  });

  await tx.whatsappMessage.updateMany({
    where: {
      leadId,
      status: { in: [WhatsappMessageStatus.QUEUED, WhatsappMessageStatus.SENDING] }
    },
    data: {
      status: WhatsappMessageStatus.SKIPPED,
      skippedAt: new Date(),
      error: "Lead was removed from active outreach."
    }
  });

  await tx.whatsappCampaignRecipient.updateMany({
    where: {
      leadId,
      status: { in: [WhatsappRecipientStatus.READY, WhatsappRecipientStatus.QUEUED] }
    },
    data: {
      status: WhatsappRecipientStatus.SKIPPED,
      reason: "Lead was removed from active outreach."
    }
  });

  await tx.deal.updateMany({
    where: { leadId, status: DealStatus.OPEN },
    data: { status: DealStatus.PAUSED }
  });

  await tx.leadEvent.create({
    data: {
      leadId,
      type: LeadEventType.SUPPRESSED,
      message: `Lead removed from active outreach: ${deletedReason}`,
      metadata: { softDelete: true, deletedAt: deletedAt.toISOString() }
    }
  });

  await tx.auditLog.create({
    data: {
      action: existing.deletedAt ? "lead.delete_requested_again" : "lead.soft_deleted",
      entityType: "lead",
      entityId: leadId,
      metadata: {
        email: existing.email,
        phoneE164: existing.phoneE164,
        company: existing.company,
        reason: deletedReason
      }
    }
  });
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
    const hasErrors = !selectedDesign.active || selectedDesign.status === EmailDesignValidationStatus.BLOCKED;
    items.push({
      key: "email_design",
      label: "Email design template",
      severity: hasErrors
        ? CampaignReviewSeverity.BLOCK
        : selectedDesign.warnings.length
          ? CampaignReviewSeverity.WARNING
          : CampaignReviewSeverity.PASS,
      message: hasErrors
        ? `Choose an active valid email design.${
            selectedDesign.errors.length ? ` ${selectedDesign.errors.join("; ")}` : ""
          }`
        : selectedDesign.warnings.length
          ? `Selected design can send, but review: ${selectedDesign.warnings.join("; ")}`
          : "Selected email design template is valid."
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

export async function createWebsiteAuditOffer(formData: FormData) {
  const parsed = websiteAuditOfferSchema.parse({
    name: formData.get("name"),
    targetAudience: formData.get("targetAudience"),
    valueProposition: formData.get("valueProposition"),
    returnTo: String(formData.get("returnTo") ?? "").trim()
  });

  const offer = await prisma.offer.create({
    data: {
      name: parsed.name,
      targetAudience: parsed.targetAudience,
      valueProposition: parsed.valueProposition,
      painPoints: linesToArray(formData.get("painPoints")),
      proofPoints: linesToArray(formData.get("proofPoints")),
      servicesIncluded: linesToArray(formData.get("servicesIncluded")).length
        ? linesToArray(formData.get("servicesIncluded"))
        : [parsed.name],
      ctaStyle:
        String(formData.get("ctaStyle") ?? "").trim() ||
        "Offer a short website review with practical improvement ideas.",
      disallowedClaims: linesToArray(formData.get("disallowedClaims")).length
        ? linesToArray(formData.get("disallowedClaims"))
        : ["Guaranteed revenue", "Guaranteed ranking", "Guaranteed leads"],
      aiVoiceRules:
        String(formData.get("aiVoiceRules") ?? "").trim() ||
        "Specific, helpful, low-pressure, and based only on visible website evidence."
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "website_audit.offer_created",
      entityType: "offer",
      entityId: offer.id,
      metadata: { name: offer.name }
    }
  });

  revalidatePath("/offers");
  revalidatePath("/campaigns/website-audits/new");
  const returnTo = parsed.returnTo && parsed.returnTo.startsWith("/") ? parsed.returnTo : "/campaigns/website-audits/new";
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}offerId=${offer.id}`);
}

export async function createWebsiteAuditRun(formData: FormData) {
  const parsed = websiteAuditRunSchema.parse({
    name: formData.get("name"),
    selectedOfferId: formData.get("selectedOfferId"),
    websitesText: String(formData.get("websitesText") ?? ""),
    country: formData.get("country"),
    source: String(formData.get("source") ?? "").trim(),
    legalBasis: String(formData.get("legalBasis") ?? "").trim(),
    maxPagesPerSite: formData.get("maxPagesPerSite")
  });

  const file = formData.get("websitesFile");
  const fileText = file instanceof File && file.size ? await file.text() : "";
  const websites = dedupeWebsiteRows(
    [...parseWebsiteRows(parsed.websitesText ?? ""), ...parseWebsiteRows(fileText)],
    WEBSITE_AUDIT_MAX_URLS
  );
  if (!websites.length) throw new Error("Add at least one valid website URL.");

  const offer = await prisma.offer.findUnique({ where: { id: parsed.selectedOfferId } });
  if (!offer || !offer.active) throw new Error("Choose an active service before starting a website audit.");

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.websiteAuditRun.create({
      data: {
        name: parsed.name,
        status: WebsiteAuditRunStatus.DRAFT,
        source: parsed.source || DEFAULT_WEBSITE_AUDIT_SOURCE,
        country: parsed.country,
        legalBasis: parsed.legalBasis || DEFAULT_WEBSITE_AUDIT_LEGAL_BASIS,
        selectedOfferId: offer.id,
        maxPagesPerSite: parsed.maxPagesPerSite,
        totalCandidates: websites.length,
        candidates: {
          create: websites.map((website) => {
            const email = normalizeEmail(website.email || "");
            return {
              websiteUrl: website.websiteUrl,
              normalizedDomain: website.normalizedDomain,
              companyName: website.company || null,
              email: email && isValidEmail(email) ? email : null,
              country: website.country || parsed.country,
              suggestedOfferId: offer.id,
              status: WebsiteAuditCandidateStatus.PENDING
            };
          })
        }
      }
    });

    await tx.auditLog.create({
      data: {
        action: "website_audit.run_created",
        entityType: "website_audit_run",
        entityId: created.id,
        metadata: {
          websites: websites.length,
          offerId: offer.id,
          source: parsed.source || DEFAULT_WEBSITE_AUDIT_SOURCE
        }
      }
    });

    return created;
  });

  await queueWebsiteAuditRun(run.id);

  revalidatePath("/campaigns");
  revalidatePath("/campaigns/website-audits");
  redirect(`/campaigns/website-audits/${run.id}`);
}

export async function updateWebsiteAuditCandidate(formData: FormData) {
  const parsed = websiteAuditCandidateSchema.parse({
    candidateId: formData.get("candidateId"),
    decision: formData.get("decision"),
    companyName: String(formData.get("companyName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    recommendedServiceName: String(formData.get("recommendedServiceName") ?? "").trim(),
    mobileAppScore: formData.get("mobileAppScore"),
    painPoints: String(formData.get("painPoints") ?? ""),
    missingFeatures: String(formData.get("missingFeatures") ?? ""),
    mobileAppSignals: String(formData.get("mobileAppSignals") ?? ""),
    generatedSubject: String(formData.get("generatedSubject") ?? "").trim(),
    generatedBody: String(formData.get("generatedBody") ?? "").trim()
  });

  const candidate = await prisma.websiteAuditCandidate.findUnique({ where: { id: parsed.candidateId } });
  if (!candidate) throw new Error("Website audit lead was not found.");

  const email = normalizeEmail(parsed.email || "");
  if (parsed.decision === "APPROVE" && !isValidEmail(email)) {
    throw new Error("Add a valid business email before approving this lead.");
  }
  if (parsed.decision === "APPROVE" && (!parsed.generatedSubject || !parsed.generatedBody)) {
    throw new Error("Add an email subject and message before approving this lead.");
  }

  const status =
    parsed.decision === "REJECT"
      ? WebsiteAuditCandidateStatus.REJECTED
      : parsed.decision === "APPROVE"
        ? WebsiteAuditCandidateStatus.APPROVED
        : candidate.status;

  await prisma.websiteAuditCandidate.update({
    where: { id: candidate.id },
    data: {
      status,
      companyName: parsed.companyName || null,
      email: email || null,
      recommendedServiceName: parsed.recommendedServiceName || null,
      mobileAppScore: parsed.mobileAppScore,
      painPoints: linesToArray(parsed.painPoints ?? ""),
      missingFeatures: linesToArray(parsed.missingFeatures ?? ""),
      mobileAppSignals: linesToArray(parsed.mobileAppSignals ?? ""),
      generatedSubject: parsed.generatedSubject || null,
      generatedBody: parsed.generatedBody || null,
      error: status === WebsiteAuditCandidateStatus.APPROVED ? null : candidate.error
    }
  });

  await refreshWebsiteAuditRunCounts(candidate.runId);
  await prisma.auditLog.create({
    data: {
      action: "website_audit.candidate_updated",
      entityType: "website_audit_candidate",
      entityId: candidate.id,
      metadata: { status }
    }
  });

  revalidatePath("/campaigns/website-audits");
  revalidatePath(`/campaigns/website-audits/${candidate.runId}`);
}

export async function approveAllWebsiteAuditCandidates(formData: FormData) {
  const parsed = websiteAuditRunIdSchema.parse({ runId: formData.get("runId") });
  const candidates = await prisma.websiteAuditCandidate.findMany({
    where: {
      runId: parsed.runId,
      status: { in: [WebsiteAuditCandidateStatus.AUDITED, WebsiteAuditCandidateStatus.NEEDS_REVIEW] }
    },
    select: { id: true, email: true, generatedSubject: true, generatedBody: true }
  });
  const approvableIds = candidates
    .filter(
      (candidate) =>
        candidate.email &&
        isValidEmail(normalizeEmail(candidate.email)) &&
        candidate.generatedSubject &&
        candidate.generatedBody
    )
    .map((candidate) => candidate.id);

  if (approvableIds.length) {
    await prisma.websiteAuditCandidate.updateMany({
      where: { id: { in: approvableIds } },
      data: { status: WebsiteAuditCandidateStatus.APPROVED, error: null }
    });
  }

  await refreshWebsiteAuditRunCounts(parsed.runId);
  await prisma.auditLog.create({
    data: {
      action: "website_audit.candidates_approved",
      entityType: "website_audit_run",
      entityId: parsed.runId,
      metadata: { approved: approvableIds.length }
    }
  });

  revalidatePath("/campaigns/website-audits");
  revalidatePath(`/campaigns/website-audits/${parsed.runId}`);
}

export async function createCampaignFromWebsiteAuditRun(formData: FormData) {
  const parsed = websiteAuditRunIdSchema.parse({
    runId: formData.get("runId"),
    campaignName: String(formData.get("campaignName") ?? "").trim() || undefined
  });

  const run = await prisma.websiteAuditRun.findUnique({
    where: { id: parsed.runId },
    include: {
      selectedOffer: true,
      candidates: {
        where: { status: WebsiteAuditCandidateStatus.APPROVED },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!run) throw new Error("Website audit run was not found.");
  if (!run.selectedOffer) throw new Error("Choose a service before creating the campaign.");

  const selectedCandidates = run.candidates.filter(
    (candidate) => candidate.email && isValidEmail(candidate.email)
  );
  if (!selectedCandidates.length) throw new Error("Approve at least one lead with a valid email.");

  const sequence = campaignStepForWebsiteAudit();
  const offer = run.selectedOffer;
  const campaignId = await prisma.$transaction(async (tx) => {
    const recipients: Array<{ leadId: string; personalization: Prisma.InputJsonObject }> = [];

    for (const candidate of selectedCandidates) {
      const email = normalizeEmail(candidate.email);
      if (!isValidEmail(email)) continue;

      const [existing, suppression] = await Promise.all([
        tx.lead.findUnique({ where: { email } }),
        tx.suppressionEntry.findUnique({ where: { email } })
      ]);
      if (suppression || (existing && blockedLeadStatuses.includes(existing.status))) {
        await tx.websiteAuditCandidate.update({
          where: { id: candidate.id },
          data: {
            status: WebsiteAuditCandidateStatus.NEEDS_REVIEW,
            error: "This email is on the Do Not Contact list or has an unsafe contact status."
          }
        });
        continue;
      }

      const lead = existing
        ? await tx.lead.update({
            where: { id: existing.id },
            data: {
              company: existing.company || candidate.companyName || undefined,
              website: existing.website || candidate.websiteUrl,
              country: existing.country || candidate.country || run.country || undefined,
              source: existing.source || run.source,
              sourceUrl: existing.sourceUrl || candidate.websiteUrl,
              legalBasis: existing.legalBasis || run.legalBasis || DEFAULT_WEBSITE_AUDIT_LEGAL_BASIS,
              consentNotes:
                existing.consentNotes || `Website audit reviewed public pages on ${candidate.websiteUrl}.`,
              status: existing.status === LeadStatus.NEW ? LeadStatus.VALIDATED : existing.status,
              serviceNeeded: existing.serviceNeeded || candidate.recommendedServiceName || offer.name
            }
          })
        : await tx.lead.create({
            data: {
              email,
              company: candidate.companyName || null,
              website: candidate.websiteUrl,
              country: candidate.country || run.country,
              source: run.source,
              sourceUrl: candidate.websiteUrl,
              legalBasis: run.legalBasis || DEFAULT_WEBSITE_AUDIT_LEGAL_BASIS,
              consentNotes: `Website audit reviewed public pages on ${candidate.websiteUrl}.`,
              status: LeadStatus.VALIDATED,
              serviceNeeded: candidate.recommendedServiceName || offer.name,
              tags: {
                create: [{ name: "website-audit" }]
              },
              events: {
                create: {
                  type: LeadEventType.IMPORTED,
                  message: `Lead added from website audit: ${run.name}`,
                  metadata: { websiteAuditRunId: run.id, candidateId: candidate.id }
                }
              }
            }
          });

      await tx.leadTag.upsert({
        where: { leadId_name: { leadId: lead.id, name: "website-audit" } },
        update: {},
        create: { leadId: lead.id, name: "website-audit" }
      });

      recipients.push({
        leadId: lead.id,
        personalization: websiteAuditPersonalization({
          candidate,
          offer
        }) as unknown as Prisma.InputJsonObject
      });
      await tx.websiteAuditCandidate.update({
        where: { id: candidate.id },
        data: { leadId: lead.id }
      });
    }

    if (!recipients.length) throw new Error("No approved leads can be contacted.");

    const campaign = await tx.campaign.create({
      data: {
        name: parsed.campaignName || `${run.name} email campaign`,
        objective: sequence.objective,
        offerId: offer.id,
        audienceFilter: {
          source: run.source,
          websiteAuditRunId: run.id,
          approvedOnly: true
        } as Prisma.InputJsonObject,
        estimatedRecipients: recipients.length,
        personalizationFields: [
          "first_name",
          "company",
          "website",
          "audit_pain_point",
          "audit_evidence",
          "recommended_improvement",
          "mobile_app_signal",
          "sender_name",
          "unsubscribe_url"
        ],
        riskFlags: ["Website audit campaign requires owner review before sending."],
        claimsUsed: offer.proofPoints.slice(0, 2),
        aiConfidence: 82,
        aiExplanation: "Created from approved website audit findings and per-lead personalization evidence.",
        steps: {
          create: [
            {
              stepOrder: 1,
              delayDays: 0,
              subject: sequence.subject,
              body: sequence.body
            },
            {
              stepOrder: 2,
              delayDays: sequence.followUp.delayDays,
              subject: sequence.followUp.subject,
              body: sequence.followUp.body
            }
          ]
        },
        variants: {
          create: {
            name: "Website audit",
            subject: sequence.subject,
            body: sequence.body
          }
        },
        recipients: {
          create: recipients.map((recipient) => ({
            leadId: recipient.leadId,
            status: CampaignRecipientStatus.READY,
            personalization: recipient.personalization
          }))
        },
        aiGenerations: {
          create: {
            provider: "website-audit",
            model: "website-audit-v1",
            prompt: {
              runId: run.id,
              offerId: offer.id,
              objective: CampaignObjective.AUDIT_OFFER
            },
            output: sequence as unknown as Prisma.InputJsonObject,
            confidence: 82
          }
        }
      }
    });

    await tx.websiteAuditCandidate.updateMany({
      where: { id: { in: selectedCandidates.map((candidate) => candidate.id) }, leadId: { not: null } },
      data: { status: WebsiteAuditCandidateStatus.CONVERTED, campaignId: campaign.id, error: null }
    });
    await tx.websiteAuditRun.update({
      where: { id: run.id },
      data: { status: WebsiteAuditRunStatus.CONVERTED, campaignId: campaign.id }
    });

    await replaceCampaignReview(campaign.id, tx);
    await tx.auditLog.create({
      data: {
        action: "website_audit.campaign_created",
        entityType: "campaign",
        entityId: campaign.id,
        metadata: { runId: run.id, recipients: recipients.length, offerId: offer.id }
      }
    });

    return campaign.id;
  });

  await refreshWebsiteAuditRunCounts(run.id);

  revalidatePath("/campaigns");
  revalidatePath("/campaigns/website-audits");
  revalidatePath(`/campaigns/website-audits/${run.id}`);
  redirect(`/campaigns/${campaignId}`);
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

export async function deleteLead(formData: FormData) {
  const parsed = deleteLeadSchema.parse({
    leadId: formData.get("leadId"),
    returnTo: String(formData.get("returnTo") ?? "").trim(),
    reason: String(formData.get("reason") ?? "").trim()
  });

  await prisma.$transaction((tx) =>
    softDeleteLead(tx, parsed.leadId, parsed.reason || "Removed from Leads by operator")
  );

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/campaigns");
  revalidatePath("/campaigns/new");
  revalidatePath("/whatsapp/campaigns/new");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  redirect(parsed.returnTo || "/leads");
}

function selectedLeadIds(formData: FormData) {
  return formData
    .getAll("leadId")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export async function createLeadGroup(formData: FormData) {
  const parsed = leadGroupSchema.parse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? "").trim(),
    leadIds: selectedLeadIds(formData)
  });

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.leadGroup.create({
      data: {
        name: parsed.name,
        description: parsed.description || null,
        members: parsed.leadIds.length
          ? {
              createMany: {
                data: parsed.leadIds.map((leadId) => ({ leadId })),
                skipDuplicates: true
              }
            }
          : undefined
      }
    });

    await tx.auditLog.create({
      data: {
        action: "lead_group.created",
        entityType: "lead_group",
        entityId: created.id,
        metadata: { name: created.name, members: parsed.leadIds.length }
      }
    });

    return created;
  });

  revalidatePath("/leads");
  revalidatePath("/campaigns/new");
  revalidatePath("/whatsapp/campaigns/new");
  redirect(`/leads?groupId=${group.id}`);
}

export async function addLeadsToGroup(formData: FormData) {
  const parsed = addLeadGroupMembersSchema.parse({
    groupId: formData.get("groupId"),
    leadIds: selectedLeadIds(formData)
  });

  await prisma.$transaction(async (tx) => {
    await tx.leadGroupMember.createMany({
      data: parsed.leadIds.map((leadId) => ({ groupId: parsed.groupId, leadId })),
      skipDuplicates: true
    });
    await tx.auditLog.create({
      data: {
        action: "lead_group.members_added",
        entityType: "lead_group",
        entityId: parsed.groupId,
        metadata: { leads: parsed.leadIds.length }
      }
    });
  });

  revalidatePath("/leads");
  revalidatePath("/campaigns/new");
  revalidatePath("/whatsapp/campaigns/new");
}

export async function removeLeadFromGroup(formData: FormData) {
  const parsed = removeLeadGroupMemberSchema.parse({
    groupId: formData.get("groupId"),
    leadId: formData.get("leadId")
  });

  await prisma.$transaction(async (tx) => {
    await tx.leadGroupMember.deleteMany({
      where: { groupId: parsed.groupId, leadId: parsed.leadId }
    });
    await tx.auditLog.create({
      data: {
        action: "lead_group.member_removed",
        entityType: "lead_group",
        entityId: parsed.groupId,
        metadata: { leadId: parsed.leadId }
      }
    });
  });

  revalidatePath("/leads");
  revalidatePath("/campaigns/new");
  revalidatePath("/whatsapp/campaigns/new");
}

export async function deleteLeadGroup(formData: FormData) {
  const parsed = deleteLeadGroupSchema.parse({
    groupId: formData.get("groupId")
  });

  await prisma.$transaction(async (tx) => {
    const group = await tx.leadGroup.findUnique({
      where: { id: parsed.groupId },
      select: { id: true, name: true, _count: { select: { members: true } } }
    });
    if (!group) throw new Error("Lead group not found.");
    await tx.leadGroup.delete({ where: { id: parsed.groupId } });
    await tx.auditLog.create({
      data: {
        action: "lead_group.deleted",
        entityType: "lead_group",
        entityId: group.id,
        metadata: { name: group.name, members: group._count.members }
      }
    });
  });

  revalidatePath("/leads");
  revalidatePath("/campaigns/new");
  revalidatePath("/whatsapp/campaigns/new");
  redirect("/leads");
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

export async function deleteCampaign(formData: FormData) {
  const parsed = deleteCampaignSchema.parse({
    campaignId: formData.get("campaignId"),
    returnTo: String(formData.get("returnTo") ?? "").trim()
  });

  await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUnique({
      where: { id: parsed.campaignId },
      include: {
        _count: {
          select: {
            recipients: true,
            steps: true,
            emailMessages: true,
            inboundReplies: true,
            sendJobs: true
          }
        }
      }
    });
    if (!campaign) throw new Error("Campaign not found.");

    await tx.campaign.delete({ where: { id: campaign.id } });
    await tx.auditLog.create({
      data: {
        action: "campaign.deleted",
        entityType: "campaign",
        entityId: campaign.id,
        metadata: {
          name: campaign.name,
          status: campaign.status,
          recipients: campaign._count.recipients,
          steps: campaign._count.steps,
          emailMessages: campaign._count.emailMessages,
          inboundReplies: campaign._count.inboundReplies,
          sendJobs: campaign._count.sendJobs
        }
      }
    });
  });

  revalidatePath("/");
  revalidatePath("/campaigns");
  revalidatePath("/reports");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  redirect(parsed.returnTo || "/campaigns");
}

export async function createCampaign(formData: FormData) {
  const parsed = campaignSchema.parse({
    name: formData.get("name"),
    offerId: formData.get("offerId"),
    objective: formData.get("objective"),
    status: formData.get("status"),
    tag: String(formData.get("tag") ?? "").trim() || undefined,
    country: String(formData.get("country") ?? "").trim() || undefined,
    groupId: String(formData.get("groupId") ?? "").trim() || undefined,
    maxRecipients: formData.get("maxRecipients")
  });

  const filter: LeadAudienceFilter = {
    status: parsed.status,
    tag: parsed.tag,
    country: parsed.country,
    groupId: parsed.groupId,
    maxRecipients: parsed.maxRecipients
  };

  const offer = await prisma.offer.findUnique({ where: { id: parsed.offerId } });
  if (!offer || !offer.active) throw new Error("Select an active offer before creating a campaign.");

  const leads = await prisma.lead.findMany({
    where: emailAudienceWhere(filter),
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

export async function selectCampaignEmailDesign(formData: FormData) {
  const parsed = emailDesignTemplateIdSchema.parse({
    campaignId: formData.get("campaignId"),
    templateId: formData.get("templateId")
  });
  const templateId = parsed.templateId?.trim() || "";

  await prisma.$transaction(async (tx) => {
    await assertCampaignDesignEditable(tx, parsed.campaignId);

    if (!templateId) {
      await tx.campaign.update({
        where: { id: parsed.campaignId },
        data: { selectedEmailDesignTemplateId: null }
      });
      await replaceCampaignReview(parsed.campaignId, tx);
      await tx.auditLog.create({
        data: {
          action: "campaign.email_design_default_selected",
          entityType: "campaign",
          entityId: parsed.campaignId
        }
      });
      return;
    }

    await ensureBuiltInEmailDesignTemplate(tx);
    const template = await tx.emailDesignTemplate.findFirst({
      where: { id: templateId, active: true }
    });
    if (!template) throw new Error("Email design template was not found.");
    if (template.status !== EmailDesignValidationStatus.VALID) {
      throw new Error("Choose a valid email design template before selecting it.");
    }

    await tx.campaign.update({
      where: { id: parsed.campaignId },
      data: { selectedEmailDesignTemplateId: template.id }
    });

    await replaceCampaignReview(parsed.campaignId, tx);
    await tx.auditLog.create({
      data: {
        action: "campaign.email_design_selected",
        entityType: "email_design_template",
        entityId: template.id,
        metadata: { campaignId: parsed.campaignId }
      }
    });
  });

  revalidatePath(`/campaigns/${parsed.campaignId}`);
  revalidatePath("/email-design-templates");
}

export async function sendCampaignEmailDesignTest(formData: FormData) {
  const parsed = emailDesignTestSchema.parse({
    campaignId: formData.get("campaignId"),
    templateId: formData.get("templateId"),
    sendingAccountId: formData.get("sendingAccountId"),
    to: formData.get("to")
  });
  const templateId = parsed.templateId?.trim() || "";

  const [campaign, account, compliance] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: parsed.campaignId },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        recipients: { include: { lead: true }, take: 1 }
      }
    }),
    prisma.sendingAccount.findUnique({ where: { id: parsed.sendingAccountId } }),
    getComplianceSettings()
  ]);

  if (!campaign || !campaign.steps.length) throw new Error("Campaign email copy is missing.");
  if (!account) throw new Error("Sending account not found.");

  const sampleLead: Pick<Lead, "firstName" | "company" | "email" | "website"> = campaign.recipients[0]?.lead ?? {
    firstName: "there",
    company: "your company",
    email: parsed.to,
    website: "https://example.com"
  };
  const samplePersonalization = campaign.recipients[0]?.personalization;
  const unsubscribeUrl = compliance.unsubscribeUrl || `${appBaseUrl()}/unsubscribe/test-preview`;
  let rendered = renderEmailCopy({
    subject: campaign.steps[0].subject,
    body: campaign.steps[0].body,
    lead: sampleLead,
    senderName: account.fromName,
    unsubscribeUrl,
    personalization: samplePersonalization
  });
  let html: string | undefined;
  let selectedTemplateId: string | null = null;

  if (templateId) {
    await ensureBuiltInEmailDesignTemplate();
    const template = await prisma.emailDesignTemplate.findFirst({
      where: { id: templateId, active: true }
    });
    if (!template) throw new Error("Email design template was not found.");
    if (template.status !== EmailDesignValidationStatus.VALID) {
      throw new Error("Choose a valid email design template before sending a test.");
    }

    const designed = renderEmailDesignTemplateHtml({
      template,
      subject: campaign.steps[0].subject,
      body: campaign.steps[0].body,
      lead: sampleLead,
      senderName: account.fromName,
      unsubscribeUrl,
      personalization: samplePersonalization
    });
    rendered = { subject: designed.subject, bodyText: designed.bodyText };
    html = designed.bodyHtml;
    selectedTemplateId = template.id;
  }

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
      entityType: selectedTemplateId ? "email_design_template" : "campaign",
      entityId: selectedTemplateId ?? campaign.id,
      metadata: {
        campaignId: campaign.id,
        to: parsed.to,
        dryRun: account.dryRun,
        templateId: selectedTemplateId
      }
    }
  });

  revalidatePath(`/campaigns/${parsed.campaignId}`);
}

export async function sendGlobalEmailDesignTest(formData: FormData) {
  const parsed = globalEmailDesignTestSchema.parse({
    templateId: formData.get("templateId"),
    sendingAccountId: formData.get("sendingAccountId"),
    to: formData.get("to")
  });

  await ensureBuiltInEmailDesignTemplate();
  const [template, account, compliance] = await Promise.all([
    prisma.emailDesignTemplate.findFirst({
      where: { id: parsed.templateId, active: true }
    }),
    prisma.sendingAccount.findUnique({ where: { id: parsed.sendingAccountId } }),
    getComplianceSettings()
  ]);

  if (!template) throw new Error("Email design template was not found.");
  if (template.status !== EmailDesignValidationStatus.VALID) {
    throw new Error("Choose a valid email design template before sending a test.");
  }
  if (!account) throw new Error("Sending account not found.");

  const unsubscribeUrl = compliance.unsubscribeUrl || `${appBaseUrl()}/unsubscribe/test-preview`;
  const rendered = renderEmailDesignTemplateHtml({
    template,
    subject: EMAIL_DESIGN_SAMPLE_SUBJECT,
    body: EMAIL_DESIGN_SAMPLE_BODY,
    lead: { ...EMAIL_DESIGN_SAMPLE_LEAD, email: parsed.to },
    senderName: account.fromName,
    unsubscribeUrl
  });

  await sendEmailDesignTest({
    account,
    to: parsed.to,
    subject: rendered.subject,
    text: rendered.bodyText,
    html: rendered.bodyHtml,
    unsubscribeUrl
  });

  await prisma.auditLog.create({
    data: {
      action: "email_design_template.test_sent",
      entityType: "email_design_template",
      entityId: template.id,
      metadata: { to: parsed.to, dryRun: account.dryRun }
    }
  });

  revalidatePath("/email-design-templates");
}

export async function createEmailDesignTemplateWithState(
  _previousState: EmailDesignTemplateActionState,
  formData: FormData
): Promise<EmailDesignTemplateActionState> {
  const input = await emailDesignTemplateValuesFromFormData(formData);
  const values = input.values;

  if (input.fileError) {
    return {
      status: "error",
      message: "Fix the uploaded HTML file before saving.",
      fieldErrors: { html: [input.fileError] },
      values,
      formKey: `file-${Date.now()}`
    };
  }

  const parsed = emailDesignTemplateCreateSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Fix the highlighted template fields before saving.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values,
      formKey: `error-${Date.now()}`
    };
  }

  const prepared = prepareEmailDesignHtml(parsed.data.html);
  if (prepared.errors.length) {
    return {
      status: "error",
      message: "Fix the HTML blockers before saving this template.",
      fieldErrors: { html: prepared.errors },
      values,
      formKey: `blocked-${Date.now()}`
    };
  }

  const slug = await uniqueEmailDesignSlug(parsed.data.name);
  const template = await prisma.emailDesignTemplate.create({
    data: {
      slug,
      name: parsed.data.name,
      description: parsed.data.description || "",
      originalHtml: parsed.data.html,
      sanitizedHtml: prepared.sanitizedHtml,
      status: prepared.status,
      warnings: prepared.warnings,
      errors: prepared.errors,
      active: true,
      builtIn: false
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "email_design_template.created",
      entityType: "email_design_template",
      entityId: template.id,
      metadata: {
        slug: template.slug,
        warningCount: prepared.warnings.length
      }
    }
  });

  revalidatePath("/email-design-templates");
  revalidatePath("/campaigns");

  return {
    status: prepared.warnings.length ? "warning" : "success",
    message: prepared.warnings.length
      ? `Template saved with ${prepared.warnings.length} warning(s). Review the warning list before live sending.`
      : "Template saved and ready to use in campaigns.",
    fieldErrors: {},
    values: { name: "", description: "", html: "" },
    formKey: `success-${template.id}`
  };
}

async function emailDesignTemplateValuesFromFormData(
  formData: FormData
): Promise<{ values: EmailDesignTemplateFormValues; fileError?: string }> {
  const pastedHtml = String(formData.get("html") ?? "");
  const file = formData.get("htmlFile");
  let fileHtml = "";
  const values = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    html: pastedHtml
  };

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_EMAIL_DESIGN_BYTES) {
      return {
        values,
        fileError: "HTML file is too large. Keep templates under 200 KB."
      };
    }
    fileHtml = await file.text();
  }

  return {
    values: {
      ...values,
      html: fileHtml || pastedHtml
    }
  };
}

async function uniqueEmailDesignSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "email-design-template";
  let slug = base;
  let suffix = 2;

  while (await prisma.emailDesignTemplate.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
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

export async function deleteInboundReply(formData: FormData) {
  const parsed = deleteReplySchema.parse({
    replyId: formData.get("replyId"),
    returnTo: String(formData.get("returnTo") ?? "").trim(),
    deleteLinkedLead: formData.get("deleteLinkedLead")
  });

  await prisma.$transaction(async (tx) => {
    const reply = await tx.inboundReply.findUnique({
      where: { id: parsed.replyId },
      include: {
        drafts: { select: { id: true } },
        lead: { select: { id: true, email: true, phoneE164: true, company: true } },
        campaign: { select: { id: true, name: true } }
      }
    });
    if (!reply) throw new Error("Reply not found.");

    const draftIds = reply.drafts.map((draft) => draft.id);
    await tx.deal.updateMany({
      where: { lastReplyId: reply.id },
      data: { lastReplyId: null }
    });
    await tx.conversationMessage.deleteMany({
      where: {
        OR: [
          { inboundReplyId: reply.id },
          ...(draftIds.length ? [{ aiReplyDraftId: { in: draftIds } }] : [])
        ]
      }
    });
    await tx.inboundReply.delete({ where: { id: reply.id } });
    if (parsed.deleteLinkedLead && reply.leadId) {
      await softDeleteLead(tx, reply.leadId, "Reply and linked contact were deleted by operator");
    }
    await tx.auditLog.create({
      data: {
        action: parsed.deleteLinkedLead ? "reply.deleted_with_lead" : "reply.deleted",
        entityType: "inbound_reply",
        entityId: reply.id,
        metadata: {
          channel: reply.channel,
          fromEmail: reply.fromEmail,
          fromPhoneE164: reply.fromPhoneE164,
          leadId: reply.leadId,
          leadEmail: reply.lead?.email,
          leadPhone: reply.lead?.phoneE164,
          leadCompany: reply.lead?.company,
          campaignId: reply.campaignId,
          campaignName: reply.campaign?.name,
          drafts: draftIds.length,
          intent: reply.intent,
          status: reply.status
        }
      }
    });
  });

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/whatsapp/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  revalidatePath("/leads");
  revalidatePath("/campaigns/new");
  revalidatePath("/whatsapp/campaigns/new");
  redirect(parsed.returnTo || "/inbox");
}

export async function cleanSystemReplies() {
  await prisma.$transaction(async (tx) => {
    const candidates = await tx.inboundReply.findMany({
      where: {
        intent: { not: ReplyIntent.NON_SALES },
        OR: [
          { channel: MessageChannel.EMAIL },
          { source: { contains: "imap", mode: "insensitive" } },
          { source: { contains: "email", mode: "insensitive" } }
        ]
      },
      include: { drafts: true },
      orderBy: { receivedAt: "desc" },
      take: 1000
    });

    const matches = candidates.filter((reply) =>
      isSystemOrMarketingReply({
        fromEmail: reply.fromEmail,
        subject: reply.subject,
        bodyText: reply.bodyText,
        raw: reply.raw
      })
    );

    for (const reply of matches) {
      await tx.inboundReply.update({
        where: { id: reply.id },
        data: {
          intent: ReplyIntent.NON_SALES,
          sentiment: ReplySentiment.NEUTRAL,
          aiConfidence: 100,
          aiSummary: "Rule matched a vendor, newsletter, platform, activation, or system email.",
          aiSuggestedAction: "Ignore this message. It is not a sales lead reply.",
          ownerActionRequired: false,
          autoReplyEligible: false,
          status: ReplyStatus.CLOSED,
          salesStage: SalesLeadStage.NOT_A_LEAD,
          riskFlags: ["Rule match: system or marketing email."],
        }
      });
      await tx.aiReplyDraft.updateMany({
        where: { replyId: reply.id, status: { in: [AiReplyDraftStatus.DRAFT, AiReplyDraftStatus.APPROVED] } },
        data: {
          status: AiReplyDraftStatus.BLOCKED,
          riskFlags: ["Blocked because this reply is a system or marketing email."]
        }
      });
      await tx.deal.deleteMany({ where: { lastReplyId: reply.id } });
    }

    if (matches.length) {
      await tx.auditLog.create({
        data: {
          action: "reply.system_cleanup",
          entityType: "inbound_reply",
          metadata: { cleaned: matches.length, checked: candidates.length }
        }
      });
    }

    return { cleaned: matches.length, checked: candidates.length };
  });

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/whatsapp/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
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

export async function removeHotLead(formData: FormData) {
  const parsed = removeHotLeadSchema.parse({
    dealId: formData.get("dealId"),
    returnTo: String(formData.get("returnTo") ?? "").trim(),
    deleteLinkedLead: formData.get("deleteLinkedLead")
  });

  await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUnique({
      where: { id: parsed.dealId },
      include: { lead: { select: { id: true, email: true, company: true } } }
    });
    if (!deal) throw new Error("Hot lead not found.");

    await tx.deal.delete({ where: { id: deal.id } });

    if (parsed.deleteLinkedLead) {
      await softDeleteLead(tx, deal.leadId, "Removed from Hot Leads and linked contact deleted by operator");
    }

    await tx.auditLog.create({
      data: {
        action: parsed.deleteLinkedLead ? "deal.removed_with_lead" : "deal.removed",
        entityType: "deal",
        entityId: deal.id,
        metadata: {
          leadId: deal.leadId,
          leadEmail: deal.lead.email,
          leadCompany: deal.lead.company,
          stage: deal.stage,
          score: deal.priorityScore
        }
      }
    });
  });

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  revalidatePath("/campaigns/new");
  revalidatePath("/whatsapp/campaigns/new");
  redirect(parsed.returnTo || "/pipeline");
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
    groupId: String(formData.get("groupId") ?? "").trim() || undefined,
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
    groupId: parsed.groupId,
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
