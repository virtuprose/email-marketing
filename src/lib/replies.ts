import {
  AiReplyDraftStatus,
  DealStage,
  DealStatus,
  EmailEventType,
  EmailMessageStatus,
  LeadEventType,
  LeadStatus,
  MessageChannel,
  Prisma,
  ReplyIntent,
  ReplySentiment,
  ReplyStatus,
  SendingAccountStatus,
  SuppressionReason,
  WhatsappEventType,
  WhatsappLeadStatus,
  WhatsappMessageStatus,
  type AiReplyDraft,
  type InboundReply,
  type Lead,
  type Offer
} from "@prisma/client";
import { z } from "zod";
import {
  buildDecisionForDraft,
  decideAiReplyAutomation,
  getAiAssistantSettings,
  logAiAssistantDecision,
  queueAiReplyDraft,
  sendHotLeadOwnerAlert,
  type AiAssistantSettings
} from "./ai-assistant";
import { isValidEmail, normalizeEmail } from "./imports";
import { prisma } from "./prisma";
import { refreshSendJobProgress, sendDirectEmail } from "./sending";
import { sendMetaTextMessage } from "./whatsapp";

export const REPLY_POLICY_VERSION = "reply-policy-v1";

export type InboundReplyInput = {
  fromEmail: string;
  toEmail?: string | null;
  subject: string;
  bodyText: string;
  source?: string;
  providerMessageId?: string | null;
  messageIdHeader?: string | null;
  inReplyTo?: string | null;
  raw?: Prisma.InputJsonValue;
};

export type WhatsappInboundReplyInput = {
  leadId: string;
  whatsappMessageId: string;
  fromPhoneE164: string;
  toPhoneE164?: string | null;
  subject: string;
  bodyText: string;
  source?: string;
  providerMessageId?: string | null;
  raw?: Prisma.InputJsonValue;
};

export type ReplyAnalysis = {
  intent: ReplyIntent;
  sentiment: ReplySentiment;
  confidence: number;
  summary: string;
  suggestedAction: string;
  ownerActionRequired: boolean;
  autoReplyEligible: boolean;
  riskFlags: string[];
  leadStatus: LeadStatus;
  scoreIntent: number;
  scoreEngagement: number;
  dealStage: DealStage;
};

export type ReplyDraftResult = {
  provider: string;
  model: string;
  subject: string;
  bodyText: string;
  confidence: number;
  rationale: string;
  riskFlags: string[];
};

type ConversationMemoryItem = {
  channel: MessageChannel;
  direction: "inbound" | "outbound";
  text: string;
  at: string;
};

const analysisSchema = z.object({
  intent: z.nativeEnum(ReplyIntent),
  sentiment: z.nativeEnum(ReplySentiment),
  confidence: z.number().int().min(0).max(100),
  summary: z.string().min(5),
  suggestedAction: z.string().min(5),
  ownerActionRequired: z.boolean(),
  autoReplyEligible: z.boolean(),
  riskFlags: z.array(z.string()).default([]),
  leadStatus: z.nativeEnum(LeadStatus),
  scoreIntent: z.number().int().min(0).max(100),
  scoreEngagement: z.number().int().min(0).max(100),
  dealStage: z.nativeEnum(DealStage)
});

const draftSchema = z.object({
  subject: z.string().min(3),
  bodyText: z.string().min(15),
  confidence: z.number().int().min(0).max(100),
  rationale: z.string().min(5),
  riskFlags: z.array(z.string()).default([])
});

const terminalNegativeIntents = new Set<ReplyIntent>([
  ReplyIntent.UNSUBSCRIBE,
  ReplyIntent.COMPLAINT,
  ReplyIntent.NOT_INTERESTED
]);

const hotIntents = new Set<ReplyIntent>([
  ReplyIntent.HOT_LEAD,
  ReplyIntent.MEETING_REQUEST,
  ReplyIntent.PRICING_REQUEST
]);

export function analyzeReplyLocally({
  subject,
  bodyText
}: {
  subject: string;
  bodyText: string;
}): ReplyAnalysis {
  const text = `${subject}\n${bodyText}`.toLowerCase();

  if (matchesAny(text, ["unsubscribe", "remove me", "stop emailing", "opt out", "take me off"])) {
    return {
      intent: ReplyIntent.UNSUBSCRIBE,
      sentiment: ReplySentiment.NEGATIVE,
      confidence: 96,
      summary: "The lead asked to stop receiving outreach.",
      suggestedAction: "Suppress this lead immediately and do not send follow-ups.",
      ownerActionRequired: false,
      autoReplyEligible: false,
      riskFlags: ["Do not send an AI reply after an opt-out request."],
      leadStatus: LeadStatus.UNSUBSCRIBED,
      scoreIntent: 0,
      scoreEngagement: 10,
      dealStage: DealStage.LOST
    };
  }

  if (matchesAny(text, ["spam", "report", "abuse", "illegal", "complaint", "harassment"])) {
    return {
      intent: ReplyIntent.COMPLAINT,
      sentiment: ReplySentiment.NEGATIVE,
      confidence: 92,
      summary: "The reply looks like a complaint or sender-reputation risk.",
      suggestedAction: "Suppress the lead, pause any related follow-up, and review the campaign source.",
      ownerActionRequired: true,
      autoReplyEligible: false,
      riskFlags: ["Complaint-risk language detected."],
      leadStatus: LeadStatus.DO_NOT_CONTACT,
      scoreIntent: 0,
      scoreEngagement: 15,
      dealStage: DealStage.LOST
    };
  }

  if (matchesAny(text, ["call me", "book", "schedule", "meeting", "zoom", "meet", "available", "calendar"])) {
    return {
      intent: ReplyIntent.MEETING_REQUEST,
      sentiment: ReplySentiment.POSITIVE,
      confidence: 91,
      summary: "The lead is open to a meeting or direct conversation.",
      suggestedAction: "Owner should take over and arrange the next conversation.",
      ownerActionRequired: true,
      autoReplyEligible: false,
      riskFlags: ["Owner handoff required before promising availability."],
      leadStatus: LeadStatus.HOT,
      scoreIntent: 95,
      scoreEngagement: 90,
      dealStage: DealStage.HOT
    };
  }

  if (matchesAny(text, ["price", "pricing", "cost", "budget", "proposal", "quote", "estimate"])) {
    return {
      intent: ReplyIntent.PRICING_REQUEST,
      sentiment: ReplySentiment.POSITIVE,
      confidence: 88,
      summary: "The lead asked about pricing, proposal, quote, or budget.",
      suggestedAction: "Owner should qualify scope before giving a price.",
      ownerActionRequired: true,
      autoReplyEligible: false,
      riskFlags: ["Do not invent prices or fixed timelines."],
      leadStatus: LeadStatus.HOT,
      scoreIntent: 90,
      scoreEngagement: 86,
      dealStage: DealStage.HOT
    };
  }

  if (
    matchesAny(text, [
      "need an app",
      "build an app",
      "need a website",
      "build a website",
      "need ecommerce",
      "need e-commerce",
      "custom software",
      "automation for",
      "we have a project",
      "project in mind",
      "can you help us build"
    ])
  ) {
    return {
      intent: ReplyIntent.HOT_LEAD,
      sentiment: ReplySentiment.POSITIVE,
      confidence: 90,
      summary: "The lead described a project or custom scope that needs owner qualification.",
      suggestedAction: "Owner should take over, ask for scope, and decide the next step.",
      ownerActionRequired: true,
      autoReplyEligible: false,
      riskFlags: ["Owner handoff required for custom scope."],
      leadStatus: LeadStatus.HOT,
      scoreIntent: 94,
      scoreEngagement: 88,
      dealStage: DealStage.HOT
    };
  }

  if (matchesAny(text, ["portfolio", "case study", "examples", "work", "proof", "clients", "show me"])) {
    return {
      intent: ReplyIntent.PORTFOLIO_REQUEST,
      sentiment: ReplySentiment.POSITIVE,
      confidence: 82,
      summary: "The lead requested proof, examples, or portfolio context.",
      suggestedAction: "Send approved proof points and ask which project type is most relevant.",
      ownerActionRequired: false,
      autoReplyEligible: true,
      riskFlags: [],
      leadStatus: LeadStatus.INTERESTED,
      scoreIntent: 72,
      scoreEngagement: 78,
      dealStage: DealStage.ENGAGED
    };
  }

  if (matchesAny(text, ["not interested", "no thanks", "not a fit", "not relevant", "we are good"])) {
    return {
      intent: ReplyIntent.NOT_INTERESTED,
      sentiment: ReplySentiment.NEGATIVE,
      confidence: 88,
      summary: "The lead declined the offer.",
      suggestedAction: "Stop campaign follow-ups and leave the lead marked not interested.",
      ownerActionRequired: false,
      autoReplyEligible: true,
      riskFlags: [],
      leadStatus: LeadStatus.NOT_INTERESTED,
      scoreIntent: 0,
      scoreEngagement: 25,
      dealStage: DealStage.FOLLOW_UP_LATER
    };
  }

  if (matchesAny(text, ["out of office", "ooo", "vacation", "annual leave", "away until"])) {
    return {
      intent: ReplyIntent.OUT_OF_OFFICE,
      sentiment: ReplySentiment.NEUTRAL,
      confidence: 84,
      summary: "The reply appears to be an out-of-office response.",
      suggestedAction: "Pause follow-ups and review after the return date if one is visible.",
      ownerActionRequired: false,
      autoReplyEligible: false,
      riskFlags: ["Automatic reply detected."],
      leadStatus: LeadStatus.REPLIED,
      scoreIntent: 15,
      scoreEngagement: 30,
      dealStage: DealStage.REPLIED
    };
  }

  if (matchesAny(text, ["wrong person", "not the right person", "talk to", "contact my colleague"])) {
    return {
      intent: ReplyIntent.WRONG_PERSON,
      sentiment: ReplySentiment.NEUTRAL,
      confidence: 78,
      summary: "The recipient may not be the decision maker.",
      suggestedAction: "Ask for the right contact only if the reply is friendly.",
      ownerActionRequired: false,
      autoReplyEligible: true,
      riskFlags: [],
      leadStatus: LeadStatus.REPLIED,
      scoreIntent: 35,
      scoreEngagement: 55,
      dealStage: DealStage.REPLIED
    };
  }

  if (matchesAny(text, ["how", "why", "already have", "too busy", "send details", "tell me more"])) {
    return {
      intent: ReplyIntent.OBJECTION,
      sentiment: ReplySentiment.NEUTRAL,
      confidence: 68,
      summary: "The lead replied with a question, objection, or request for more context.",
      suggestedAction: "AI can draft a concise answer using only approved Virtuprose offer facts.",
      ownerActionRequired: false,
      autoReplyEligible: false,
      riskFlags: ["Review needed if the objection asks for claims, guarantees, or pricing."],
      leadStatus: LeadStatus.INTERESTED,
      scoreIntent: 58,
      scoreEngagement: 70,
      dealStage: DealStage.ENGAGED
    };
  }

  if (matchesAny(text, ["interested", "sounds good", "yes", "send", "details", "more info"])) {
    return {
      intent: ReplyIntent.GENERAL_INTEREST,
      sentiment: ReplySentiment.POSITIVE,
      confidence: 76,
      summary: "The lead appears interested and asked to continue the conversation.",
      suggestedAction: "Send a short clarifying reply and ask one qualification question.",
      ownerActionRequired: false,
      autoReplyEligible: false,
      riskFlags: [],
      leadStatus: LeadStatus.INTERESTED,
      scoreIntent: 72,
      scoreEngagement: 75,
      dealStage: DealStage.ENGAGED
    };
  }

  return {
    intent: ReplyIntent.UNCLEAR,
    sentiment: ReplySentiment.NEUTRAL,
    confidence: 45,
    summary: "The reply needs human review before the system decides how to continue.",
    suggestedAction: "Review manually and either mark hot, suppress, or send a custom reply.",
    ownerActionRequired: true,
    autoReplyEligible: false,
    riskFlags: ["Low-confidence classification."],
    leadStatus: LeadStatus.REPLIED,
    scoreIntent: 35,
    scoreEngagement: 55,
    dealStage: DealStage.REPLIED
  };
}

export function generateLocalReplyDraft({
  reply,
  lead,
  offer,
  analysis
}: {
  reply: Pick<InboundReply, "subject" | "bodyText">;
  lead: Pick<Lead, "firstName" | "company" | "email">;
  offer?: Pick<Offer, "name" | "valueProposition" | "proofPoints" | "ctaStyle"> | null;
  analysis: ReplyAnalysis;
}): ReplyDraftResult {
  const firstName = lead.firstName || "there";
  const offerName = offer?.name || "Virtuprose work";
  const proof = offer?.proofPoints[0] || "approved Virtuprose work examples";
  const subject = reply.subject.toLowerCase().startsWith("re:") ? reply.subject : `Re: ${reply.subject}`;
  const signoff = ["", "Best,", "Virtuprose"].join("\n");
  const noPressureLine = "If this is not useful, tell me and I will not follow up.";

  if (analysis.intent === ReplyIntent.UNSUBSCRIBE || analysis.intent === ReplyIntent.COMPLAINT) {
    return {
      provider: "local-reply-agent",
      model: REPLY_POLICY_VERSION,
      subject,
      bodyText: "No reply should be sent. The lead must be suppressed.",
      confidence: analysis.confidence,
      rationale: "The reply indicates opt-out or complaint risk.",
      riskFlags: ["Blocked by reply policy."]
    };
  }

  if (analysis.intent === ReplyIntent.NOT_INTERESTED) {
    return {
      provider: "local-reply-agent",
      model: REPLY_POLICY_VERSION,
      subject,
      bodyText: [`Hi ${firstName},`, "", "Understood. I will not keep following up.", signoff].join("\n"),
      confidence: analysis.confidence,
      rationale: "Acknowledges the decline without pressure.",
      riskFlags: []
    };
  }

  if (analysis.intent === ReplyIntent.PORTFOLIO_REQUEST) {
    return {
      provider: "local-reply-agent",
      model: REPLY_POLICY_VERSION,
      subject,
      bodyText: [
        `Hi ${firstName},`,
        "",
        `Yes. The most relevant proof for ${offerName} is: ${proof}.`,
        "",
        "If you share the website or workflow you want improved, I can reply with a concise review focused on practical fixes.",
        "",
        noPressureLine,
        signoff
      ].join("\n"),
      confidence: analysis.confidence,
      rationale: "Uses approved proof point and asks for one useful next input.",
      riskFlags: []
    };
  }

  if (analysis.intent === ReplyIntent.WRONG_PERSON) {
    return {
      provider: "local-reply-agent",
      model: REPLY_POLICY_VERSION,
      subject,
      bodyText: [
        `Hi ${firstName},`,
        "",
        "Thanks for letting me know. Who would be the right person to speak with about this?",
        "",
        noPressureLine,
        signoff
      ].join("\n"),
      confidence: analysis.confidence,
      rationale: "Asks for a referral without continuing pressure.",
      riskFlags: []
    };
  }

  if (hotIntents.has(analysis.intent)) {
    return {
      provider: "local-reply-agent",
      model: REPLY_POLICY_VERSION,
      subject,
      bodyText: [
        `Hi ${firstName},`,
        "",
        "Thanks for replying. This sounds worth handling directly so I can understand the scope properly.",
        "",
        `For context, Virtuprose can help with ${offerName.toLowerCase()}. ${offer?.valueProposition ?? ""}`.trim(),
        "",
        "Could you share the website/link and the main outcome you want from this? I will review it and come back with the next step.",
        "",
        noPressureLine,
        signoff
      ].join("\n"),
      confidence: analysis.confidence,
      rationale: "Creates a safe owner handoff without inventing pricing or availability.",
      riskFlags: analysis.riskFlags
    };
  }

  return {
    provider: "local-reply-agent",
    model: REPLY_POLICY_VERSION,
    subject,
    bodyText: [
      `Hi ${firstName},`,
      "",
      `Thanks for replying. Based on what you shared, ${offerName.toLowerCase()} may be relevant if the priority is improving clarity, trust, or the sales path.`,
      "",
      "What is the main issue you want fixed right now?",
      "",
      noPressureLine,
      signoff
    ].join("\n"),
    confidence: analysis.confidence,
    rationale: "Keeps the conversation moving with one qualification question.",
    riskFlags: analysis.riskFlags
  };
}

export async function ingestInboundReply(input: InboundReplyInput) {
  const fromEmail = normalizeEmail(input.fromEmail);
  if (!isValidEmail(fromEmail)) {
    throw new Error("Inbound reply must include a valid sender email.");
  }
  if (!input.bodyText.trim()) {
    throw new Error("Inbound reply body cannot be empty.");
  }

  if (input.providerMessageId) {
    const existing = await prisma.inboundReply.findUnique({
      where: { providerMessageId: input.providerMessageId },
      include: { lead: true, drafts: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (existing) return { reply: existing, duplicate: true };
  }

  const lead = await ensureLeadForReply(fromEmail);
  const message = await findMatchingSentMessage(lead.id, input);
  const campaign = message
    ? await prisma.campaign.findUnique({ where: { id: message.campaignId }, include: { offer: true } })
    : null;

  const reply = await prisma.inboundReply.create({
    data: {
      leadId: lead.id,
      channel: MessageChannel.EMAIL,
      campaignId: message?.campaignId ?? null,
      emailMessageId: message?.id ?? null,
      fromEmail,
      toEmail: input.toEmail ? normalizeEmail(input.toEmail) : null,
      subject: input.subject.trim() || "(no subject)",
      bodyText: input.bodyText.trim(),
      source: input.source || "manual",
      providerMessageId: input.providerMessageId || null,
      messageIdHeader: input.messageIdHeader || null,
      inReplyTo: input.inReplyTo || null,
      ...(input.raw ? { raw: input.raw } : {})
    }
  });

  await prisma.emailEvent.create({
    data: {
      type: EmailEventType.REPLY_RECEIVED,
      messageId: message?.id,
      campaignId: message?.campaignId,
      leadId: lead.id,
      metadata: {
        replyId: reply.id,
        source: reply.source,
        fromEmail
      }
    }
  });

  return {
    reply: await processInboundReply(reply.id, campaign?.offer ?? null),
    duplicate: false
  };
}

export async function ingestWhatsappInboundReply(input: WhatsappInboundReplyInput) {
  if (!input.bodyText.trim()) {
    throw new Error("Inbound WhatsApp reply body cannot be empty.");
  }

  if (input.providerMessageId) {
    const existing = await prisma.inboundReply.findUnique({
      where: { providerMessageId: input.providerMessageId },
      include: { lead: true, drafts: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (existing) return { reply: existing, duplicate: true };
  }

  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new Error("Inbound WhatsApp reply must be linked to a lead.");

  const message = await prisma.whatsappMessage.findUnique({
    where: { id: input.whatsappMessageId },
    include: { campaign: { include: { offer: true } } }
  });

  const reply = await prisma.inboundReply.create({
    data: {
      leadId: lead.id,
      channel: MessageChannel.WHATSAPP,
      whatsappMessageId: input.whatsappMessageId,
      fromPhoneE164: input.fromPhoneE164,
      toPhoneE164: input.toPhoneE164 || null,
      subject: input.subject.trim() || "WhatsApp reply",
      bodyText: input.bodyText.trim(),
      source: input.source || "meta_whatsapp",
      providerMessageId: input.providerMessageId || null,
      ...(input.raw ? { raw: input.raw } : {})
    }
  });

  return {
    reply: await processInboundReply(reply.id, message?.campaign?.offer ?? null),
    duplicate: false
  };
}

export async function processInboundReply(replyId: string, knownOffer?: Offer | null) {
  const reply = await prisma.inboundReply.findUnique({
    where: { id: replyId },
    include: {
      lead: true,
      campaign: { include: { offer: true } },
      emailMessage: true,
      whatsappMessage: { include: { campaign: { include: { offer: true } } } }
    }
  });
  if (!reply) throw new Error("Inbound reply not found.");
  if (!reply.lead) throw new Error("Inbound reply is not linked to a lead.");

  const lead = reply.lead;
  const settings = await getAiAssistantSettings();
  if (!settings.enabled || settings.mode === "PAUSED") {
    await prisma.$transaction(async (tx) => {
      await tx.inboundReply.update({
        where: { id: reply.id },
        data: {
          status: ReplyStatus.OWNER_REVIEW,
          ownerActionRequired: true,
          autoReplyEligible: false,
          aiSummary: "AI Assistant is paused, so this reply is waiting for owner review.",
          aiSuggestedAction: "Review this reply manually or turn AI Assistant back on."
        }
      });
      await tx.auditLog.create({
        data: {
          action: "ai_assistant.decision",
          entityType: "inbound_reply",
          entityId: reply.id,
          metadata: {
            leadId: lead.id,
            shouldAutoSend: false,
            shouldNotifyOwner: false,
            delaySeconds: 0,
            mode: settings.mode,
            reasons: [settings.enabled ? "AI Assistant is paused." : "AI Assistant is turned off."]
          }
        }
      });
    });
    const pausedReply = await prisma.inboundReply.findUnique({
      where: { id: reply.id },
      include: { lead: true, drafts: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    if (!pausedReply) throw new Error("Processed inbound reply not found.");
    return pausedReply;
  }

  const offer = knownOffer ?? reply.campaign?.offer ?? reply.whatsappMessage?.campaign?.offer ?? null;
  const conversationMemory = await buildConversationMemory({
    leadId: lead.id,
    channel: reply.channel,
    currentReplyId: reply.id
  });
  const analysis = await analyzeReplyWithAiFallback(reply, offer, settings, conversationMemory);
  const shouldSuppress =
    analysis.intent === ReplyIntent.UNSUBSCRIBE || analysis.intent === ReplyIntent.COMPLAINT;
  const draft = await generateReplyDraftWithAiFallback({
    reply,
    lead,
    offer,
    analysis,
    settings,
    conversationMemory
  });
  const stopped = await stopQueuedFollowUpsForLead(lead.id, reply.campaignId);
  const stoppedWhatsapp = await stopQueuedWhatsappMessagesForLead(lead.id, reply.whatsappMessage?.campaignId);
  const nextActionAt = nextActionForAnalysis(analysis);
  const status = replyStatusForAnalysis(analysis);
  const fitScore = scoreFit(lead);
  let createdDraftId: string | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.inboundReply.update({
      where: { id: reply.id },
      data: {
        status,
        intent: analysis.intent,
        sentiment: analysis.sentiment,
        aiConfidence: analysis.confidence,
        aiSummary: analysis.summary,
        aiSuggestedAction: analysis.suggestedAction,
        ownerActionRequired: analysis.ownerActionRequired,
        autoReplyEligible: analysis.autoReplyEligible,
        riskFlags: analysis.riskFlags
      }
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: analysis.leadStatus,
        scoreFit: Math.max(lead.scoreFit, fitScore),
        scoreEngagement: Math.max(lead.scoreEngagement, analysis.scoreEngagement),
        scoreIntent: Math.max(lead.scoreIntent, analysis.scoreIntent),
        nextActionAt,
        aiAutoReplyPaused: hotIntents.has(analysis.intent) ? true : lead.aiAutoReplyPaused,
        aiAutoReplyPausedAt: hotIntents.has(analysis.intent) ? new Date() : lead.aiAutoReplyPausedAt,
        aiAutoReplyPauseReason: hotIntents.has(analysis.intent)
          ? "AI handed this hot lead to the owner."
          : lead.aiAutoReplyPauseReason,
        whatsappBotPaused: hotIntents.has(analysis.intent) ? true : lead.whatsappBotPaused,
        whatsappHandoffReason: hotIntents.has(analysis.intent)
          ? "AI handed this hot lead to the owner."
          : lead.whatsappHandoffReason
      }
    });

    await tx.leadEvent.create({
      data: {
        leadId: lead.id,
        type: LeadEventType.STATUS_CHANGED,
        message: `AI classified reply as ${analysis.intent}.`,
        metadata: {
          replyId: reply.id,
          confidence: analysis.confidence,
          stoppedQueuedFollowUps: stopped.skipped,
          stoppedQueuedWhatsappMessages: stoppedWhatsapp.skipped
        }
      }
    });

    if (shouldSuppress) {
      await tx.suppressionEntry.upsert({
        where: { email: lead.email },
        update: {
          reason:
            analysis.intent === ReplyIntent.UNSUBSCRIBE
              ? SuppressionReason.UNSUBSCRIBED
              : SuppressionReason.COMPLAINT,
          source: "inbound_reply",
          notes: analysis.summary
        },
        create: {
          email: lead.email,
          reason:
            analysis.intent === ReplyIntent.UNSUBSCRIBE
              ? SuppressionReason.UNSUBSCRIBED
              : SuppressionReason.COMPLAINT,
          source: "inbound_reply",
          notes: analysis.summary
        }
      });
    }

    const createdDraft = await tx.aiReplyDraft.create({
      data: {
        replyId: reply.id,
        channel: reply.channel,
        leadId: lead.id,
        campaignId: reply.campaignId,
        offerId: offer?.id ?? null,
        status: shouldSuppress ? AiReplyDraftStatus.BLOCKED : AiReplyDraftStatus.DRAFT,
        provider: draft.provider,
        model: draft.model,
        subject: draft.subject,
        bodyText: draft.bodyText,
        confidence: draft.confidence,
        rationale: draft.rationale,
        riskFlags: [...draft.riskFlags, ...(settings.mode === "TEST_MODE" ? ["Test Mode is on."] : [])],
        policyVersion: REPLY_POLICY_VERSION
      }
    });
    createdDraftId = createdDraft.id;

    await tx.emailEvent.create({
      data: {
        type: EmailEventType.AI_REPLY_DRAFTED,
        messageId: reply.emailMessageId,
        campaignId: reply.campaignId,
        leadId: lead.id,
        metadata: {
          replyId: reply.id,
          intent: analysis.intent,
          confidence: analysis.confidence,
          blocked: shouldSuppress
        }
      }
    });

    await tx.deal.upsert({
      where: { leadId: lead.id },
      update: {
        campaignId: reply.campaignId,
        offerId: offer?.id ?? undefined,
        stage: analysis.dealStage,
        status: terminalNegativeIntents.has(analysis.intent) ? DealStatus.PAUSED : DealStatus.OPEN,
        priorityScore: analysis.scoreIntent,
        nextAction: analysis.suggestedAction,
        nextActionAt,
        lastReplyId: reply.id
      },
      create: {
        leadId: lead.id,
        campaignId: reply.campaignId,
        offerId: offer?.id ?? undefined,
        title: dealTitle(lead, offer),
        stage: analysis.dealStage,
        status: terminalNegativeIntents.has(analysis.intent) ? DealStatus.PAUSED : DealStatus.OPEN,
        priorityScore: analysis.scoreIntent,
        nextAction: analysis.suggestedAction,
        nextActionAt,
        lastReplyId: reply.id
      }
    });

    await tx.auditLog.create({
      data: {
        action: "reply.ai_classified",
        entityType: "inbound_reply",
        entityId: reply.id,
        metadata: {
          leadId: lead.id,
          intent: analysis.intent,
          confidence: analysis.confidence,
          stoppedQueuedFollowUps: stopped.skipped,
          stoppedQueuedWhatsappMessages: stoppedWhatsapp.skipped,
          promptVersion: REPLY_POLICY_VERSION,
          knowledgeUsed: {
            companyIntro: settings.knowledgeBase.companyIntro,
            services: settings.knowledgeBase.services,
            pricingRules: settings.knowledgeBase.pricingRules
          }
        }
      }
    });
  });

  for (const sendJobId of stopped.sendJobIds) {
    await refreshSendJobProgress(sendJobId);
  }

  if (createdDraftId) {
    const createdDraft = await prisma.aiReplyDraft.findUnique({
      where: { id: createdDraftId },
      include: { reply: true, lead: true }
    });
    if (createdDraft?.lead) {
      const decision = await buildDecisionForDraft(
        createdDraft as AiReplyDraft & { reply: InboundReply; lead: Lead },
        settings
      );
      await logAiAssistantDecision({
        replyId: reply.id,
        draftId: createdDraft.id,
        leadId: lead.id,
        decision,
        metadata: {
          intent: analysis.intent,
          confidence: analysis.confidence,
          channel: reply.channel,
          promptVersion: REPLY_POLICY_VERSION
        }
      });
      if (decision.shouldNotifyOwner) {
        await sendHotLeadOwnerAlert(reply.id);
      }
      if (decision.shouldAutoSend && !shouldSuppress) {
        await queueAiReplyDraft(createdDraft.id, decision.delaySeconds);
      }
    }
  }

  const processed = await prisma.inboundReply.findUnique({
    where: { id: reply.id },
    include: { lead: true, drafts: { orderBy: { createdAt: "desc" }, take: 1 } }
  });
  if (!processed) throw new Error("Processed inbound reply not found.");
  return processed;
}

export async function sendAiReplyDraft(draftId: string, sendingAccountId?: string) {
  const draft = await prisma.aiReplyDraft.findUnique({
    where: { id: draftId },
    include: {
      reply: true,
      lead: true
    }
  });
  if (!draft || !draft.lead) throw new Error("AI reply draft not found.");
  const lead = draft.lead;
  if (draft.status === AiReplyDraftStatus.BLOCKED) {
    throw new Error("This AI draft is blocked by policy and cannot be sent.");
  }
  if (draft.status === AiReplyDraftStatus.SENT) return draft;

  const suppression = await prisma.suppressionEntry.findUnique({ where: { email: lead.email } });
  const blockedStatuses: LeadStatus[] = [LeadStatus.UNSUBSCRIBED, LeadStatus.DO_NOT_CONTACT];
  if (suppression || blockedStatuses.includes(lead.status)) {
    await prisma.aiReplyDraft.update({
      where: { id: draft.id },
      data: {
        status: AiReplyDraftStatus.BLOCKED,
        riskFlags: [...draft.riskFlags, "Lead is suppressed or do-not-contact."]
      }
    });
    throw new Error("Lead is suppressed or do-not-contact.");
  }

  if (draft.channel === MessageChannel.WHATSAPP) {
    return sendWhatsappAiReplyDraft(draft.id);
  }

  const account = sendingAccountId
    ? await prisma.sendingAccount.findUnique({ where: { id: sendingAccountId } })
    : await prisma.sendingAccount.findFirst({
        where: { status: SendingAccountStatus.ACTIVE },
        orderBy: { createdAt: "asc" }
      });
  if (!account) throw new Error("No active sending account is available.");

  const result = await sendDirectEmail({
    account,
    to: lead.email,
    subject: draft.subject,
    text: draft.bodyText
  });

  const sent = await prisma.$transaction(async (tx) => {
    const updated = await tx.aiReplyDraft.update({
      where: { id: draft.id },
      data: {
        status: AiReplyDraftStatus.SENT,
        sentAt: new Date(),
        providerMessageId: result.providerMessageId
      }
    });
    await tx.inboundReply.update({
      where: { id: draft.replyId },
      data: { status: ReplyStatus.AUTO_REPLIED }
    });
    await tx.emailEvent.create({
      data: {
        type: EmailEventType.REPLY_SENT,
        campaignId: draft.campaignId,
        leadId: draft.leadId,
        metadata: {
          draftId: draft.id,
          replyId: draft.replyId,
          providerMessageId: result.providerMessageId,
          dryRun: result.dryRun
        }
      }
    });
    await tx.leadEvent.create({
      data: {
        leadId: lead.id,
        type: LeadEventType.NOTE_UPDATED,
        message: result.dryRun ? "AI reply dry-run recorded." : "AI reply sent through SMTP.",
        metadata: {
          replyId: draft.replyId,
          draftId: draft.id,
          providerMessageId: result.providerMessageId
        }
      }
    });
    await tx.auditLog.create({
      data: {
        action: "reply.ai_draft_sent",
        entityType: "ai_reply_draft",
        entityId: draft.id,
        metadata: {
          replyId: draft.replyId,
          leadId: draft.leadId,
          dryRun: result.dryRun
        }
      }
    });
    return updated;
  });

  return sent;
}

async function sendWhatsappAiReplyDraft(draftId: string) {
  const draft = await prisma.aiReplyDraft.findUnique({
    where: { id: draftId },
    include: { reply: true, lead: true }
  });
  if (!draft || !draft.lead) throw new Error("WhatsApp AI reply draft not found.");
  if (!draft.lead.phoneE164 || draft.reply.channel !== MessageChannel.WHATSAPP) {
    throw new Error("This draft is not linked to a WhatsApp conversation.");
  }
  if (!isWithinWhatsappServiceWindow(draft.lead.whatsappServiceWindowExpiresAt, draft.reply.receivedAt)) {
    await prisma.aiReplyDraft.update({
      where: { id: draft.id },
      data: {
        status: AiReplyDraftStatus.BLOCKED,
        riskFlags: [...draft.riskFlags, "Outside WhatsApp 24-hour customer service window."]
      }
    });
    throw new Error("Outside WhatsApp 24-hour customer service window.");
  }
  if (draft.lead.whatsappStatus === WhatsappLeadStatus.STOPPED || draft.lead.whatsappStoppedAt) {
    throw new Error("Lead opted out of WhatsApp messages.");
  }

  const result = await sendMetaTextMessage({
    toPhoneE164: draft.lead.phoneE164,
    body: draft.bodyText
  });

  const sent = await prisma.$transaction(async (tx) => {
    const message = await tx.whatsappMessage.create({
      data: {
        leadId: draft.lead!.id,
        status: WhatsappMessageStatus.SENT,
        direction: "outbound_ai",
        toPhoneE164: draft.lead!.phoneE164,
        bodyText: draft.bodyText,
        providerMessageId: result.providerMessageId,
        sentAt: new Date()
      }
    });
    const updated = await tx.aiReplyDraft.update({
      where: { id: draft.id },
      data: {
        status: AiReplyDraftStatus.SENT,
        sentAt: new Date(),
        providerMessageId: result.providerMessageId
      }
    });
    await tx.inboundReply.update({
      where: { id: draft.replyId },
      data: { status: ReplyStatus.AUTO_REPLIED }
    });
    await tx.whatsappEvent.create({
      data: {
        type: WhatsappEventType.AI_REPLY_SENT,
        messageId: message.id,
        leadId: draft.leadId,
        metadata: {
          draftId: draft.id,
          replyId: draft.replyId,
          providerMessageId: result.providerMessageId,
          dryRun: result.dryRun
        }
      }
    });
    await tx.leadEvent.create({
      data: {
        leadId: draft.lead!.id,
        type: LeadEventType.NOTE_UPDATED,
        message: result.dryRun ? "WhatsApp AI reply dry-run recorded." : "WhatsApp AI reply sent.",
        metadata: {
          replyId: draft.replyId,
          draftId: draft.id,
          providerMessageId: result.providerMessageId
        }
      }
    });
    return updated;
  });

  return sent;
}

export async function markReplyOwnerReviewed(replyId: string) {
  const reply = await prisma.inboundReply.update({
    where: { id: replyId },
    data: { status: ReplyStatus.CLOSED, ownerActionRequired: false }
  });

  await prisma.auditLog.create({
    data: {
      action: "reply.owner_reviewed",
      entityType: "inbound_reply",
      entityId: reply.id
    }
  });

  return reply;
}

export async function pauseAiForLead(leadId: string, reason = "Owner took over this lead.") {
  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      aiAutoReplyPaused: true,
      aiAutoReplyPausedAt: new Date(),
      aiAutoReplyPauseReason: reason,
      whatsappBotPaused: true,
      whatsappHandoffReason: reason
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "ai_assistant.lead_paused",
      entityType: "lead",
      entityId: lead.id,
      metadata: { reason }
    }
  });

  return lead;
}

export async function resumeAiForLead(leadId: string) {
  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      aiAutoReplyPaused: false,
      aiAutoReplyPausedAt: null,
      aiAutoReplyPauseReason: null,
      whatsappBotPaused: false,
      whatsappHandoffReason: null
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "ai_assistant.lead_resumed",
      entityType: "lead",
      entityId: lead.id,
      metadata: { reason: "Owner turned AI back on for this lead." }
    }
  });

  return lead;
}

export async function previewAiAssistantReply({
  channel,
  bodyText,
  subject = "Test reply"
}: {
  channel: MessageChannel;
  bodyText: string;
  subject?: string;
}) {
  const settings = await getAiAssistantSettings();
  const offer = await prisma.offer.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const reply = {
    id: "preview",
    channel,
    subject,
    bodyText,
    intent: ReplyIntent.UNCLEAR,
    aiConfidence: 0,
    autoReplyEligible: false,
    riskFlags: [],
    ownerActionRequired: true
  };
  const lead = {
    id: "preview-lead",
    email: "preview@example.com",
    phoneE164: "+96500000000",
    firstName: "Preview",
    lastName: null,
    company: "Preview Company",
    website: null,
    role: null,
    industry: null,
    country: null,
    timezone: null,
    source: "ai_preview",
    sourceUrl: null,
    legalBasis: "Preview",
    consentNotes: null,
    whatsappOptIn: true,
    whatsappConsentSource: "Preview",
    whatsappStatus: WhatsappLeadStatus.OPTED_IN,
    lastWhatsappContactedAt: null,
    lastWhatsappCustomerMessageAt: new Date(),
    whatsappServiceWindowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    whatsappBotPaused: false,
    whatsappHandoffReason: null,
    whatsappStoppedAt: null,
    aiAutoReplyPaused: false,
    aiAutoReplyPausedAt: null,
    aiAutoReplyPauseReason: null,
    ownerNotes: null,
    status: LeadStatus.REPLIED,
    scoreFit: 50,
    scoreEngagement: 50,
    scoreIntent: 0,
    lastContactedAt: null,
    nextActionAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  } as Lead;

  const analysis = await analyzeReplyWithAiFallback(reply, offer, settings, []);
  const draft = await generateReplyDraftWithAiFallback({
    reply,
    lead,
    offer,
    analysis,
    settings,
    conversationMemory: []
  });
  const decision = await decidePreviewAutomation({ channel, analysis, draft, settings });

  return { analysis, draft, decision };
}

export async function markReplyAsHot(replyId: string) {
  const reply = await prisma.inboundReply.findUnique({ where: { id: replyId }, include: { lead: true } });
  if (!reply || !reply.lead) throw new Error("Reply not found.");

  await prisma.$transaction(async (tx) => {
    await tx.inboundReply.update({
      where: { id: reply.id },
      data: {
        status: ReplyStatus.HOT_HANDOFF,
        intent: ReplyIntent.HOT_LEAD,
        ownerActionRequired: true,
        aiSuggestedAction: "Owner should handle this lead directly."
      }
    });
    await tx.lead.update({
      where: { id: reply.lead!.id },
      data: {
        status: LeadStatus.HOT,
        scoreIntent: 100,
        scoreEngagement: Math.max(reply.lead!.scoreEngagement, 90),
        aiAutoReplyPaused: true,
        aiAutoReplyPausedAt: new Date(),
        aiAutoReplyPauseReason: "Owner handoff for hot lead.",
        whatsappBotPaused: true,
        whatsappHandoffReason: "Owner handoff for hot lead."
      }
    });
    await tx.deal.upsert({
      where: { leadId: reply.lead!.id },
      update: {
        stage: DealStage.HOT,
        status: DealStatus.OPEN,
        priorityScore: 100,
        nextAction: "Owner should handle this lead directly.",
        lastReplyId: reply.id
      },
      create: {
        leadId: reply.lead!.id,
        campaignId: reply.campaignId,
        title: dealTitle(reply.lead!, null),
        stage: DealStage.HOT,
        status: DealStatus.OPEN,
        priorityScore: 100,
        nextAction: "Owner should handle this lead directly.",
        lastReplyId: reply.id
      }
    });
    await tx.leadTag.upsert({
      where: { leadId_name: { leadId: reply.lead!.id, name: "hot" } },
      update: {},
      create: { leadId: reply.lead!.id, name: "hot" }
    });
  });

  await sendHotLeadOwnerAlert(reply.id);
  return reply;
}

export async function updateDealStage(dealId: string, stage: DealStage, notes?: string) {
  const status =
    stage === DealStage.WON ? DealStatus.WON : stage === DealStage.LOST ? DealStatus.LOST : DealStatus.OPEN;
  const leadStatus =
    stage === DealStage.WON ? LeadStatus.WON : stage === DealStage.LOST ? LeadStatus.LOST : undefined;

  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: {
      stage,
      status,
      ownerNotes: notes || undefined,
      closedAt: status === DealStatus.WON || status === DealStatus.LOST ? new Date() : null
    }
  });

  if (leadStatus) {
    await prisma.lead.update({ where: { id: deal.leadId }, data: { status: leadStatus } });
  }

  await prisma.auditLog.create({
    data: {
      action: "deal.stage_updated",
      entityType: "deal",
      entityId: deal.id,
      metadata: { stage, status }
    }
  });

  return deal;
}

async function analyzeReplyWithAiFallback(
  reply: Pick<InboundReply, "subject" | "bodyText">,
  offer?: Offer | null,
  settings?: AiAssistantSettings,
  conversationMemory: ConversationMemoryItem[] = []
) {
  const fallback = analyzeReplyLocally(reply);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_REPLY_MODEL || "gpt-4.1-mini";

  if (!apiKey) return fallback;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              settings?.prompts.businessRules || "",
              settings?.prompts.classifier ||
                "Classify inbound B2B sales replies for Virtuprose. Output only JSON.",
              settings?.prompts.safety || "",
              "Output only JSON. Never recommend replying after unsubscribe or complaint. Do not invent facts, prices, guarantees, availability, portfolio claims, or unsupported proof."
            ]
              .filter(Boolean)
              .join("\n\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              subject: reply.subject,
              bodyText: reply.bodyText,
              offer,
              conversationMemory,
              approvedKnowledge: settings?.knowledgeBase,
              allowedLeadStatuses: Object.values(LeadStatus),
              allowedDealStages: Object.values(DealStage),
              allowedIntents: Object.values(ReplyIntent)
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "reply_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "intent",
                "sentiment",
                "confidence",
                "summary",
                "suggestedAction",
                "ownerActionRequired",
                "autoReplyEligible",
                "riskFlags",
                "leadStatus",
                "scoreIntent",
                "scoreEngagement",
                "dealStage"
              ],
              properties: {
                intent: { type: "string", enum: Object.values(ReplyIntent) },
                sentiment: { type: "string", enum: Object.values(ReplySentiment) },
                confidence: { type: "integer", minimum: 0, maximum: 100 },
                summary: { type: "string" },
                suggestedAction: { type: "string" },
                ownerActionRequired: { type: "boolean" },
                autoReplyEligible: { type: "boolean" },
                riskFlags: { type: "array", items: { type: "string" } },
                leadStatus: { type: "string", enum: Object.values(LeadStatus) },
                scoreIntent: { type: "integer", minimum: 0, maximum: 100 },
                scoreEngagement: { type: "integer", minimum: 0, maximum: 100 },
                dealStage: { type: "string", enum: Object.values(DealStage) }
              }
            }
          }
        }
      })
    });

    if (!response.ok) throw new Error(`OpenAI reply analysis failed with ${response.status}`);
    const data = (await response.json()) as unknown;
    return analysisSchema.parse(JSON.parse(extractOutputText(data)));
  } catch {
    return {
      ...fallback,
      riskFlags: [...fallback.riskFlags, "OpenAI reply analysis was unavailable; local fallback used."]
    };
  }
}

async function generateReplyDraftWithAiFallback({
  reply,
  lead,
  offer,
  analysis,
  settings,
  conversationMemory = []
}: {
  reply: Pick<InboundReply, "subject" | "bodyText">;
  lead: Lead;
  offer?: Offer | null;
  analysis: ReplyAnalysis;
  settings?: AiAssistantSettings;
  conversationMemory?: ConversationMemoryItem[];
}) {
  const fallback = generateLocalReplyDraft({ reply, lead, offer, analysis });
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_REPLY_MODEL || "gpt-4.1-mini";

  if (!apiKey || analysis.intent === ReplyIntent.UNSUBSCRIBE || analysis.intent === ReplyIntent.COMPLAINT) {
    return fallback;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              settings?.prompts.businessRules || "",
              settings?.prompts.safety || "",
              settings
                ? "Use only the approved knowledge base and current offer context. If the lead asks for pricing, meeting, proposal, exact scope, or anything not approved, create a safe handoff-style draft and do not invent details."
                : "",
              "Output only JSON.",
              "For WhatsApp, keep the reply short and conversational with no subject-line wording.",
              "For email, stay concise and professional.",
              "Do not mention AI. Do not mention prices, guarantees, fake availability, fake case studies, unsupported claims, or exact timelines. Keep one clear next question."
            ]
              .filter(Boolean)
              .join("\n\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              inboundSubject: reply.subject,
              inboundBody: reply.bodyText,
              lead: {
                firstName: lead.firstName,
                company: lead.company,
                email: lead.email
              },
              offer,
              approvedKnowledge: settings?.knowledgeBase,
              conversationMemory,
              analysis
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "reply_draft",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["subject", "bodyText", "confidence", "rationale", "riskFlags"],
              properties: {
                subject: { type: "string" },
                bodyText: { type: "string" },
                confidence: { type: "integer", minimum: 0, maximum: 100 },
                rationale: { type: "string" },
                riskFlags: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      })
    });

    if (!response.ok) throw new Error(`OpenAI reply draft failed with ${response.status}`);
    const data = (await response.json()) as unknown;
    const parsed = draftSchema.parse(JSON.parse(extractOutputText(data)));

    return {
      provider: "openai",
      model,
      ...parsed
    };
  } catch {
    return {
      ...fallback,
      riskFlags: [...fallback.riskFlags, "OpenAI reply draft was unavailable; local fallback used."]
    };
  }
}

async function ensureLeadForReply(email: string) {
  const existing = await prisma.lead.findUnique({ where: { email } });
  if (existing) return existing;

  const domain = email.split("@")[1] || null;
  return prisma.lead.create({
    data: {
      email,
      company: domain ? domain.split(".")[0] : null,
      source: "inbound_reply",
      legalBasis: "Inbound conversation",
      consentNotes: "Created from an inbound reply that did not match an imported lead.",
      status: LeadStatus.REPLIED,
      scoreEngagement: 50
    }
  });
}

async function buildConversationMemory({
  leadId,
  channel,
  currentReplyId
}: {
  leadId: string;
  channel: MessageChannel;
  currentReplyId: string;
}): Promise<ConversationMemoryItem[]> {
  if (channel === MessageChannel.WHATSAPP) {
    const messages = await prisma.whatsappMessage.findMany({
      where: { leadId },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      take: 8
    });
    return messages
      .reverse()
      .filter((message) => Boolean(message.bodyText))
      .slice(-5)
      .map((message) => ({
        channel: MessageChannel.WHATSAPP,
        direction: message.direction.startsWith("inbound") ? "inbound" : "outbound",
        text: message.bodyText || "",
        at: (message.sentAt || message.createdAt).toISOString()
      }));
  }

  const [inboundReplies, outboundMessages] = await Promise.all([
    prisma.inboundReply.findMany({
      where: { leadId, channel: MessageChannel.EMAIL, id: { not: currentReplyId } },
      orderBy: { receivedAt: "desc" },
      take: 5
    }),
    prisma.emailMessage.findMany({
      where: { leadId, status: EmailMessageStatus.SENT },
      orderBy: { sentAt: "desc" },
      take: 5
    })
  ]);

  return [
    ...inboundReplies.map((reply) => ({
      channel: MessageChannel.EMAIL,
      direction: "inbound" as const,
      text: `${reply.subject}\n${reply.bodyText}`,
      at: reply.receivedAt.toISOString()
    })),
    ...outboundMessages.map((message) => ({
      channel: MessageChannel.EMAIL,
      direction: "outbound" as const,
      text: `${message.subject}\n${message.bodyText}`,
      at: (message.sentAt || message.createdAt).toISOString()
    }))
  ]
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(-5);
}

async function decidePreviewAutomation({
  channel,
  analysis,
  draft,
  settings
}: {
  channel: MessageChannel;
  analysis: ReplyAnalysis;
  draft: ReplyDraftResult;
  settings: AiAssistantSettings;
}) {
  return decideAiReplyAutomation({
    reply: {
      id: "preview",
      channel,
      intent: analysis.intent,
      aiConfidence: analysis.confidence,
      autoReplyEligible: analysis.autoReplyEligible,
      riskFlags: analysis.riskFlags,
      ownerActionRequired: analysis.ownerActionRequired
    },
    lead: {
      id: "preview-lead",
      aiAutoReplyPaused: false,
      whatsappBotPaused: false
    },
    draft: {
      id: "preview-draft",
      status: AiReplyDraftStatus.DRAFT,
      riskFlags: draft.riskFlags
    },
    settings,
    whatsappWindowOpen: true,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    existingOwnerReviewCount: 0,
    sentToday: 0,
    duplicateSentDraftCount: 0
  });
}

async function findMatchingSentMessage(leadId: string, input: InboundReplyInput) {
  const candidates = [input.inReplyTo, input.messageIdHeader, input.providerMessageId]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];

  if (candidates.length) {
    const exact = await prisma.emailMessage.findFirst({
      where: {
        leadId,
        OR: [{ messageIdHeader: { in: candidates } }, { providerMessageId: { in: candidates } }]
      },
      orderBy: { sentAt: "desc" }
    });
    if (exact) return exact;
  }

  return prisma.emailMessage.findFirst({
    where: { leadId, status: EmailMessageStatus.SENT },
    orderBy: { sentAt: "desc" }
  });
}

async function stopQueuedFollowUpsForLead(leadId: string, campaignId?: string | null) {
  const queuedMessages = await prisma.emailMessage.findMany({
    where: {
      leadId,
      campaignId: campaignId ?? undefined,
      status: EmailMessageStatus.QUEUED
    },
    select: { id: true, sendJobId: true, campaignId: true, leadId: true }
  });

  if (!queuedMessages.length) return { skipped: 0, sendJobIds: [] as string[] };

  await prisma.emailMessage.updateMany({
    where: { id: { in: queuedMessages.map((message) => message.id) } },
    data: {
      status: EmailMessageStatus.SKIPPED,
      skippedAt: new Date(),
      error: "Lead replied; AI inbox is handling the conversation."
    }
  });

  await prisma.emailEvent.createMany({
    data: queuedMessages.map((message) => ({
      type: EmailEventType.SKIPPED,
      messageId: message.id,
      campaignId: message.campaignId,
      leadId: message.leadId,
      metadata: { reason: "lead_replied" }
    }))
  });

  return {
    skipped: queuedMessages.length,
    sendJobIds: Array.from(new Set(queuedMessages.map((message) => message.sendJobId)))
  };
}

async function stopQueuedWhatsappMessagesForLead(leadId: string, campaignId?: string | null) {
  const queuedMessages = await prisma.whatsappMessage.findMany({
    where: {
      leadId,
      campaignId: campaignId ?? undefined,
      status: WhatsappMessageStatus.QUEUED
    },
    select: { id: true, sendJobId: true, campaignId: true, leadId: true }
  });

  if (!queuedMessages.length) return { skipped: 0, sendJobIds: [] as string[] };

  await prisma.whatsappMessage.updateMany({
    where: { id: { in: queuedMessages.map((message) => message.id) } },
    data: {
      status: WhatsappMessageStatus.SKIPPED,
      skippedAt: new Date(),
      error: "Lead replied; AI inbox is handling the WhatsApp conversation."
    }
  });

  await prisma.whatsappEvent.createMany({
    data: queuedMessages.map((message) => ({
      type: WhatsappEventType.SKIPPED,
      messageId: message.id,
      campaignId: message.campaignId,
      leadId: message.leadId,
      metadata: { reason: "lead_replied" }
    }))
  });

  return {
    skipped: queuedMessages.length,
    sendJobIds: Array.from(
      new Set(queuedMessages.map((message) => message.sendJobId).filter(Boolean))
    ) as string[]
  };
}

function isWithinWhatsappServiceWindow(serviceWindowExpiresAt: Date | null | undefined, receivedAt: Date) {
  if (serviceWindowExpiresAt) return serviceWindowExpiresAt.getTime() > Date.now();
  return Date.now() - receivedAt.getTime() <= 24 * 60 * 60 * 1000;
}

function replyStatusForAnalysis(analysis: ReplyAnalysis) {
  if (analysis.intent === ReplyIntent.UNSUBSCRIBE || analysis.intent === ReplyIntent.COMPLAINT) {
    return ReplyStatus.SUPPRESSED;
  }
  if (hotIntents.has(analysis.intent)) return ReplyStatus.HOT_HANDOFF;
  if (analysis.ownerActionRequired) return ReplyStatus.OWNER_REVIEW;
  return ReplyStatus.DRAFT_READY;
}

function nextActionForAnalysis(analysis: ReplyAnalysis) {
  if (analysis.intent === ReplyIntent.OUT_OF_OFFICE) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  if (analysis.intent === ReplyIntent.NOT_INTERESTED) return null;
  if (analysis.intent === ReplyIntent.UNSUBSCRIBE || analysis.intent === ReplyIntent.COMPLAINT) return null;
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

function scoreFit(lead: Lead) {
  let score = 20;
  if (lead.company) score += 20;
  if (lead.website) score += 20;
  if (lead.role) score += 10;
  if (lead.industry) score += 10;
  if (lead.country) score += 10;
  if (lead.source && lead.legalBasis) score += 10;
  return Math.min(score, 100);
}

function dealTitle(lead: Pick<Lead, "company" | "email">, offer?: Pick<Offer, "name"> | null) {
  const account = lead.company || lead.email;
  return offer ? `${account} - ${offer.name}` : `${account} - Virtuprose opportunity`;
}

function matchesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function extractOutputText(data: unknown) {
  if (typeof data === "object" && data && "output_text" in data && typeof data.output_text === "string") {
    return data.output_text;
  }

  const response = data as {
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  const outputText = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && typeof content.text === "string")?.text;

  if (!outputText) {
    throw new Error("AI response did not include output text.");
  }

  return outputText;
}
