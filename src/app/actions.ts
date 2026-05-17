"use server";

import {
  CampaignObjective,
  CampaignRecipientStatus,
  CampaignReviewSeverity,
  CampaignStatus,
  DealStage,
  EmailMessageStatus,
  ImportRowStatus,
  LeadEventType,
  LeadStatus,
  Prisma,
  SendJobStatus,
  SuppressionReason
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
import { emailQueue } from "@/lib/queue";
import {
  ingestInboundReply,
  markReplyAsHot,
  markReplyOwnerReviewed,
  processInboundReply,
  sendAiReplyDraft,
  updateDealStage
} from "@/lib/replies";
import { COMPLIANCE_SETTINGS_KEY, parseComplianceSettings } from "@/lib/settings";
import {
  SENDING_CONTROL_SETTINGS_KEY,
  scheduleCampaignSend,
  sendTestEmail,
  sendingAccountStatus,
  pauseSendJob
} from "@/lib/sending";

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

const manualReplySchema = z.object({
  fromEmail: z.string().email(),
  toEmail: z.string().email().optional().or(z.literal("")),
  subject: z.string().min(1),
  bodyText: z.string().min(5)
});

const replyIdSchema = z.object({
  replyId: z.string().min(1)
});

const aiReplyDraftSchema = z.object({
  draftId: z.string().min(1),
  replyId: z.string().min(1),
  sendingAccountId: z.string().optional().or(z.literal(""))
});

const dealStageSchema = z.object({
  dealId: z.string().min(1),
  stage: z.nativeEnum(DealStage),
  notes: z.string().optional()
});

const blockedLeadStatuses: LeadStatus[] = [
  LeadStatus.SUPPRESSED,
  LeadStatus.UNSUBSCRIBED,
  LeadStatus.BOUNCED,
  LeadStatus.DO_NOT_CONTACT
];

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
      recipients: { include: { lead: true } }
    }
  });

  if (!campaign) throw new Error("Campaign not found.");

  const recipientLeads = campaign.recipients.map((recipient) => recipient.lead);
  const suppressedCount = recipientLeads.filter((lead) => blockedLeadStatuses.includes(lead.status)).length;
  const missingComplianceCount = recipientLeads.filter(
    (lead) => !lead.country || !lead.source || !lead.legalBasis
  ).length;
  const compliance = await getComplianceSettings(tx);

  return reviewCampaign({
    audienceCount: recipientLeads.length,
    suppressedCount,
    missingComplianceCount,
    offer: offerForGeneration(campaign.offer),
    subjectBodies: campaign.steps.map((step) => ({ subject: step.subject, body: step.body })),
    compliance
  });
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
    sendingAccountId: String(formData.get("sendingAccountId") ?? "").trim()
  });

  await sendAiReplyDraft(parsed.draftId, parsed.sendingAccountId || undefined);

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  redirect(`/inbox?selected=${parsed.replyId}`);
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
