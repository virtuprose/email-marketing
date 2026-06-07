import {
  AiReplyDraftStatus,
  MessageChannel,
  ReplyIntent,
  ReplyStatus,
  type AiReplyDraft,
  type InboundReply,
  type Lead
} from "@prisma/client";
import { z } from "zod";
import { aiReplyQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, ensureDefaultSendingAccount, sendDirectEmail } from "@/lib/sending";

export const AI_ASSISTANT_SETTINGS_KEY = "ai_assistant_settings";
export const AI_ASSISTANT_LAST_TEST_KEY = "ai_assistant_last_test";
export const AI_ASSISTANT_POLICY_VERSION = "ai-employee-v1";

export const aiAssistantModes = ["AUTO_SAFE", "DRAFT_ONLY", "PAUSED", "TEST_MODE"] as const;
export type AiAssistantMode = (typeof aiAssistantModes)[number];

export type AiAssistantSettings = {
  enabled: boolean;
  mode: AiAssistantMode;
  ownerHotLeadEmail: string;
  channels: {
    whatsapp: { enabled: boolean; autoReply: boolean };
    email: { enabled: boolean; autoReply: boolean };
  };
  confidence: {
    autoSendMinimum: number;
    draftMinimum: number;
  };
  timing: {
    minReplyDelaySeconds: number;
    maxReplyDelaySeconds: number;
    dailyAutoReplyCap: number;
  };
  handoffIntents: ReplyIntent[];
  safety: {
    blockOptOuts: boolean;
    blockComplaints: boolean;
    blockPricingPromises: boolean;
    blockMeetingPromises: boolean;
    requireWhatsapp24HourWindow: boolean;
    stopAiAfterOwnerTakeover: boolean;
    preventDuplicateReplies: boolean;
  };
  prompts: {
    businessRules: string;
    classifier: string;
    whatsappReply: string;
    emailReply: string;
    safety: string;
  };
  knowledgeBase: {
    companyIntro: string;
    services: string[];
    portfolioLinks: string[];
    pricingRules: string[];
    faqs: string[];
    forbiddenClaims: string[];
  };
};

export type AiReplyDecision = {
  shouldAutoSend: boolean;
  shouldDraft: boolean;
  shouldNotifyOwner: boolean;
  delaySeconds: number;
  reasons: string[];
  mode: AiAssistantMode;
};

const defaultPrompts = {
  businessRules:
    "You are the Virtuprose sales assistant. Your job is to answer simple safe questions, qualify the lead, and bring hot leads to the owner. Be concise, honest, friendly, and low pressure. Use only approved knowledge.",
  classifier:
    "Classify inbound B2B replies for Virtuprose. Safe questions about services, examples, portfolio, company info, or next steps can be answered by AI when approved knowledge exists. Pricing, meeting, proposal, complaint, stop/opt-out, unclear custom scope, or strong buying intent must hand off to the owner. Never recommend replying after a complaint or opt-out.",
  whatsappReply:
    "Write a short WhatsApp reply. Sound human and direct. Ask one clear question. Do not mention AI. If they ask for examples, share the approved portfolio link. Do not invent prices, timelines, guarantees, meetings, availability, or portfolio claims.",
  emailReply:
    "Write a concise professional email reply. Ask one clear qualification question. Use only approved facts. If they ask for examples, share the approved portfolio link. Do not invent prices, guarantees, availability, timelines, or proof.",
  safety:
    "Hand off to the owner for hot leads, pricing, proposals, meetings, complaints, opt-outs, unclear intent, custom scope, or anything requiring promises."
};

export const defaultAiAssistantSettings: AiAssistantSettings = {
  enabled: true,
  mode: "AUTO_SAFE",
  ownerHotLeadEmail: "moh@virtuprose.com",
  channels: {
    whatsapp: { enabled: true, autoReply: true },
    email: { enabled: true, autoReply: true }
  },
  confidence: {
    autoSendMinimum: 85,
    draftMinimum: 60
  },
  timing: {
    minReplyDelaySeconds: 30,
    maxReplyDelaySeconds: 120,
    dailyAutoReplyCap: 100
  },
  handoffIntents: [
    ReplyIntent.HOT_LEAD,
    ReplyIntent.MEETING_REQUEST,
    ReplyIntent.PRICING_REQUEST,
    ReplyIntent.COMPLAINT,
    ReplyIntent.UNSUBSCRIBE,
    ReplyIntent.UNCLEAR
  ],
  safety: {
    blockOptOuts: true,
    blockComplaints: true,
    blockPricingPromises: true,
    blockMeetingPromises: true,
    requireWhatsapp24HourWindow: true,
    stopAiAfterOwnerTakeover: true,
    preventDuplicateReplies: true
  },
  prompts: defaultPrompts,
  knowledgeBase: {
    companyIntro:
      "Virtuprose builds websites, ecommerce experiences, SaaS/MVP products, and practical AI workflow tools.",
    services: [
      "Website redesign and conversion improvement",
      "Shopify and ecommerce revamp",
      "SaaS and MVP product build",
      "Website maintenance and support",
      "Automation and AI workflow setup"
    ],
    portfolioLinks: ["https://virtuprose.com/portfolio"],
    pricingRules: [
      "Do not give prices unless the owner has approved exact pricing for that service.",
      "For pricing questions, ask for scope and hand off to the owner."
    ],
    faqs: [
      "Virtuprose can review a website, store, product idea, or workflow and suggest practical next steps."
    ],
    forbiddenClaims: [
      "Guaranteed revenue",
      "Guaranteed delivery timeline without discovery",
      "Fake availability",
      "Fake client names or unapproved case studies",
      "Exact pricing unless approved in the knowledge base"
    ]
  }
};

const stringArraySchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string()));

export const aiAssistantFormSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(aiAssistantModes),
  ownerHotLeadEmail: z.string().email(),
  whatsappEnabled: z.boolean(),
  whatsappAutoReply: z.boolean(),
  emailEnabled: z.boolean(),
  emailAutoReply: z.boolean(),
  autoSendMinimum: z.coerce.number().int().min(50).max(100),
  draftMinimum: z.coerce.number().int().min(0).max(100),
  minReplyDelaySeconds: z.coerce.number().int().min(0).max(3600),
  maxReplyDelaySeconds: z.coerce.number().int().min(0).max(3600),
  dailyAutoReplyCap: z.coerce.number().int().min(1).max(1000),
  businessRules: z.string().min(20),
  classifier: z.string().min(20),
  whatsappReply: z.string().min(20),
  emailReply: z.string().min(20),
  safety: z.string().min(20),
  companyIntro: z.string().min(10),
  services: stringArraySchema,
  portfolioLinks: stringArraySchema,
  pricingRules: stringArraySchema,
  faqs: stringArraySchema,
  forbiddenClaims: stringArraySchema
});

export function parseAiAssistantSettings(value: unknown): AiAssistantSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultAiAssistantSettings;
  const record = value as Record<string, unknown>;
  const defaults = defaultAiAssistantSettings;

  const channels =
    record.channels && typeof record.channels === "object" && !Array.isArray(record.channels)
      ? (record.channels as Record<string, unknown>)
      : {};
  const whatsapp = parseChannel(channels.whatsapp, defaults.channels.whatsapp);
  const email = parseChannel(channels.email, defaults.channels.email);

  const timing =
    record.timing && typeof record.timing === "object" ? (record.timing as Record<string, unknown>) : {};
  const confidence =
    record.confidence && typeof record.confidence === "object"
      ? (record.confidence as Record<string, unknown>)
      : {};
  const safety =
    record.safety && typeof record.safety === "object" ? (record.safety as Record<string, unknown>) : {};
  const prompts =
    record.prompts && typeof record.prompts === "object" ? (record.prompts as Record<string, unknown>) : {};
  const knowledgeBase =
    record.knowledgeBase && typeof record.knowledgeBase === "object"
      ? (record.knowledgeBase as Record<string, unknown>)
      : {};

  const mode = aiAssistantModes.includes(record.mode as AiAssistantMode)
    ? (record.mode as AiAssistantMode)
    : defaults.mode;

  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : defaults.enabled,
    mode,
    ownerHotLeadEmail:
      typeof record.ownerHotLeadEmail === "string" && record.ownerHotLeadEmail.includes("@")
        ? record.ownerHotLeadEmail
        : defaults.ownerHotLeadEmail,
    channels: { whatsapp, email },
    confidence: {
      autoSendMinimum: numberInRange(
        confidence.autoSendMinimum,
        50,
        100,
        defaults.confidence.autoSendMinimum
      ),
      draftMinimum: numberInRange(confidence.draftMinimum, 0, 100, defaults.confidence.draftMinimum)
    },
    timing: normalizeTiming({
      minReplyDelaySeconds: numberInRange(
        timing.minReplyDelaySeconds,
        0,
        3600,
        defaults.timing.minReplyDelaySeconds
      ),
      maxReplyDelaySeconds: numberInRange(
        timing.maxReplyDelaySeconds,
        0,
        3600,
        defaults.timing.maxReplyDelaySeconds
      ),
      dailyAutoReplyCap: numberInRange(timing.dailyAutoReplyCap, 1, 1000, defaults.timing.dailyAutoReplyCap)
    }),
    handoffIntents: parseHandoffIntents(record.handoffIntents),
    safety: {
      blockOptOuts: booleanValue(safety.blockOptOuts, defaults.safety.blockOptOuts),
      blockComplaints: booleanValue(safety.blockComplaints, defaults.safety.blockComplaints),
      blockPricingPromises: booleanValue(safety.blockPricingPromises, defaults.safety.blockPricingPromises),
      blockMeetingPromises: booleanValue(safety.blockMeetingPromises, defaults.safety.blockMeetingPromises),
      requireWhatsapp24HourWindow: booleanValue(
        safety.requireWhatsapp24HourWindow,
        defaults.safety.requireWhatsapp24HourWindow
      ),
      stopAiAfterOwnerTakeover: booleanValue(
        safety.stopAiAfterOwnerTakeover,
        defaults.safety.stopAiAfterOwnerTakeover
      ),
      preventDuplicateReplies: booleanValue(
        safety.preventDuplicateReplies,
        defaults.safety.preventDuplicateReplies
      )
    },
    prompts: {
      businessRules: stringValue(prompts.businessRules, defaults.prompts.businessRules),
      classifier: stringValue(prompts.classifier, defaults.prompts.classifier),
      whatsappReply: stringValue(prompts.whatsappReply, defaults.prompts.whatsappReply),
      emailReply: stringValue(prompts.emailReply, defaults.prompts.emailReply),
      safety: stringValue(prompts.safety, defaults.prompts.safety)
    },
    knowledgeBase: {
      companyIntro: stringValue(knowledgeBase.companyIntro, defaults.knowledgeBase.companyIntro),
      services: stringArrayValue(knowledgeBase.services, defaults.knowledgeBase.services),
      portfolioLinks: stringArrayValue(knowledgeBase.portfolioLinks, defaults.knowledgeBase.portfolioLinks),
      pricingRules: stringArrayValue(knowledgeBase.pricingRules, defaults.knowledgeBase.pricingRules),
      faqs: stringArrayValue(knowledgeBase.faqs, defaults.knowledgeBase.faqs),
      forbiddenClaims: stringArrayValue(knowledgeBase.forbiddenClaims, defaults.knowledgeBase.forbiddenClaims)
    }
  };
}

export async function getAiAssistantSettings(tx: typeof prisma = prisma) {
  const setting = await tx.setting.findUnique({ where: { key: AI_ASSISTANT_SETTINGS_KEY } });
  return parseAiAssistantSettings(setting?.value);
}

export async function saveAiAssistantSettings(settings: AiAssistantSettings) {
  await prisma.setting.upsert({
    where: { key: AI_ASSISTANT_SETTINGS_KEY },
    update: { value: settings },
    create: { key: AI_ASSISTANT_SETTINGS_KEY, value: settings }
  });
}

export function settingsFromForm(input: z.infer<typeof aiAssistantFormSchema>): AiAssistantSettings {
  return {
    ...defaultAiAssistantSettings,
    enabled: input.enabled,
    mode: input.mode,
    ownerHotLeadEmail: input.ownerHotLeadEmail,
    channels: {
      whatsapp: { enabled: input.whatsappEnabled, autoReply: input.whatsappAutoReply },
      email: { enabled: input.emailEnabled, autoReply: input.emailAutoReply }
    },
    confidence: {
      autoSendMinimum: input.autoSendMinimum,
      draftMinimum: input.draftMinimum
    },
    timing: normalizeTiming({
      minReplyDelaySeconds: input.minReplyDelaySeconds,
      maxReplyDelaySeconds: input.maxReplyDelaySeconds,
      dailyAutoReplyCap: input.dailyAutoReplyCap
    }),
    prompts: {
      businessRules: input.businessRules,
      classifier: input.classifier,
      whatsappReply: input.whatsappReply,
      emailReply: input.emailReply,
      safety: input.safety
    },
    knowledgeBase: {
      companyIntro: input.companyIntro,
      services: input.services,
      portfolioLinks: input.portfolioLinks,
      pricingRules: input.pricingRules,
      faqs: input.faqs,
      forbiddenClaims: input.forbiddenClaims
    },
    handoffIntents: defaultAiAssistantSettings.handoffIntents,
    safety: defaultAiAssistantSettings.safety
  };
}

export async function decideAiReplyAutomation({
  reply,
  lead,
  draft,
  settings,
  whatsappWindowOpen,
  openAiConfigured,
  existingOwnerReviewCount,
  sentToday,
  duplicateSentDraftCount
}: {
  reply: Pick<
    InboundReply,
    "id" | "channel" | "intent" | "aiConfidence" | "autoReplyEligible" | "riskFlags" | "ownerActionRequired"
  >;
  lead: Pick<Lead, "id" | "aiAutoReplyPaused" | "whatsappBotPaused">;
  draft: Pick<AiReplyDraft, "id" | "riskFlags" | "status"> | null;
  settings: AiAssistantSettings;
  whatsappWindowOpen: boolean;
  openAiConfigured: boolean;
  existingOwnerReviewCount: number;
  sentToday: number;
  duplicateSentDraftCount: number;
}): Promise<AiReplyDecision> {
  const reasons: string[] = [];
  const channelKey = reply.channel === MessageChannel.WHATSAPP ? "whatsapp" : "email";
  const channel = settings.channels[channelKey];

  if (!settings.enabled) reasons.push("AI Assistant is turned off.");
  if (settings.mode === "PAUSED") reasons.push("AI Assistant is paused.");
  if (settings.mode === "DRAFT_ONLY") reasons.push("Draft Only mode is on.");
  if (settings.mode === "TEST_MODE") reasons.push("Test Mode is on.");
  if (!channel.enabled) reasons.push(`${channelKey === "whatsapp" ? "WhatsApp" : "Email"} replies are off.`);
  if (!channel.autoReply)
    reasons.push(`${channelKey === "whatsapp" ? "WhatsApp" : "Email"} auto-reply is off.`);
  if (!openAiConfigured) reasons.push("OpenAI is not configured.");
  if (!draft) reasons.push("No AI draft was created.");
  if (draft?.status !== AiReplyDraftStatus.DRAFT) reasons.push("AI draft is not sendable.");
  if (reply.aiConfidence < settings.confidence.autoSendMinimum)
    reasons.push("AI confidence is below auto-send level.");
  if (!reply.autoReplyEligible) reasons.push("AI marked this reply as not safe for automatic sending.");
  if (reply.ownerActionRequired) reasons.push("AI says the owner should review this reply.");
  if (reply.riskFlags.length || draft?.riskFlags.length) reasons.push("Risk flags need review.");
  if (settings.handoffIntents.includes(reply.intent))
    reasons.push("This reply should be handed to the owner.");
  if (lead.aiAutoReplyPaused || (reply.channel === MessageChannel.WHATSAPP && lead.whatsappBotPaused)) {
    reasons.push("AI is off for this lead.");
  }
  if (
    reply.channel === MessageChannel.WHATSAPP &&
    settings.safety.requireWhatsapp24HourWindow &&
    !whatsappWindowOpen
  ) {
    reasons.push("WhatsApp reply window is closed.");
  }
  if (sentToday >= settings.timing.dailyAutoReplyCap) reasons.push("Daily AI reply limit has been reached.");
  if (settings.safety.preventDuplicateReplies && duplicateSentDraftCount > 0) {
    reasons.push("AI already replied to this message.");
  }
  if (existingOwnerReviewCount > 0) reasons.push("A previous reply for this lead still needs owner review.");

  return {
    shouldAutoSend: reasons.length === 0,
    shouldDraft: settings.enabled && settings.mode !== "PAUSED",
    shouldNotifyOwner: shouldNotifyOwnerForIntent(reply.intent),
    delaySeconds: randomDelaySeconds(settings),
    reasons,
    mode: settings.mode
  };
}

export async function queueAiReplyDraft(draftId: string, delaySeconds: number) {
  const queue = aiReplyQueue();
  await queue.add("ai.reply.send", { draftId }, { delay: Math.max(0, delaySeconds) * 1000 });
  await queue.close();
}

export async function processQueuedAiReply(
  draftId: string,
  sendDraft: (draftId: string) => Promise<unknown>
) {
  const draft = await prisma.aiReplyDraft.findUnique({
    where: { id: draftId },
    include: { reply: true, lead: true }
  });
  if (!draft || !draft.reply || !draft.lead) return { skipped: true, reason: "draft_missing" };

  const settings = await getAiAssistantSettings();
  const draftWithRelations = draft as AiReplyDraft & { reply: InboundReply; lead: Lead };
  const decision = await buildDecisionForDraft(draftWithRelations, settings);
  await logAiAssistantDecision({
    replyId: draft.replyId,
    draftId: draft.id,
    leadId: draft.leadId,
    decision,
    action: "ai_assistant.queued_decision"
  });

  if (!decision.shouldAutoSend) return { skipped: true, reason: decision.reasons.join("; ") };
  return sendDraft(draftId);
}

export async function buildDecisionForDraft(
  draft: AiReplyDraft & { reply: InboundReply; lead: Lead },
  settings: AiAssistantSettings
) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [sentToday, duplicateSentDraftCount, existingOwnerReviewCount] = await Promise.all([
    prisma.aiReplyDraft.count({
      where: { status: AiReplyDraftStatus.SENT, sentAt: { gte: dayStart } }
    }),
    prisma.aiReplyDraft.count({
      where: { replyId: draft.replyId, status: AiReplyDraftStatus.SENT }
    }),
    prisma.inboundReply.count({
      where: {
        leadId: draft.leadId,
        id: { not: draft.replyId },
        ownerActionRequired: true,
        status: { in: [ReplyStatus.OWNER_REVIEW, ReplyStatus.HOT_HANDOFF] }
      }
    })
  ]);

  return decideAiReplyAutomation({
    reply: draft.reply,
    lead: draft.lead,
    draft,
    settings,
    whatsappWindowOpen:
      draft.reply.channel !== MessageChannel.WHATSAPP ||
      Boolean(
        draft.lead.whatsappServiceWindowExpiresAt &&
        draft.lead.whatsappServiceWindowExpiresAt.getTime() > Date.now()
      ),
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    existingOwnerReviewCount,
    sentToday,
    duplicateSentDraftCount
  });
}

export async function sendHotLeadOwnerAlert(replyId: string) {
  const reply = await prisma.inboundReply.findUnique({
    where: { id: replyId },
    include: {
      lead: true,
      drafts: { orderBy: { createdAt: "desc" }, take: 1 },
      whatsappMessage: true,
      emailMessage: true
    }
  });
  if (!reply || !reply.lead || !shouldNotifyOwnerForIntent(reply.intent)) {
    return { skipped: true, reason: "not_hot" };
  }

  const existing = await prisma.auditLog.findFirst({
    where: { action: "ai_assistant.hot_lead_alert_sent", entityType: "inbound_reply", entityId: reply.id }
  });
  if (existing) return { skipped: true, reason: "already_sent" };

  const settings = await getAiAssistantSettings();
  const account = await ensureDefaultSendingAccount();
  const subject = `Hot lead: ${reply.lead.company || reply.lead.firstName || reply.fromEmail || reply.fromPhoneE164}`;
  const platformUrl = `${appBaseUrl()}${reply.channel === MessageChannel.WHATSAPP ? "/whatsapp/inbox" : "/inbox"}?selected=${reply.id}`;
  const text = [
    "A lead needs your attention.",
    "",
    `Channel: ${reply.channel === MessageChannel.WHATSAPP ? "WhatsApp" : "Email"}`,
    `Lead: ${reply.lead.firstName || ""} ${reply.lead.lastName || ""}`.trim(),
    `Company: ${reply.lead.company || "Unknown"}`,
    `Email: ${reply.lead.email}`,
    `Phone: ${reply.lead.phoneE164 || reply.fromPhoneE164 || "Unknown"}`,
    "",
    "What they said:",
    reply.bodyText,
    "",
    `AI summary: ${reply.aiSummary || "No summary yet."}`,
    `Why hot: ${reply.intent}`,
    `Suggested next action: ${reply.aiSuggestedAction || "Review and reply personally."}`,
    "",
    `Open in platform: ${platformUrl}`
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await sendDirectEmail({
      account,
      to: settings.ownerHotLeadEmail,
      subject,
      text
    });
    await prisma.auditLog.create({
      data: {
        action: "ai_assistant.hot_lead_alert_sent",
        entityType: "inbound_reply",
        entityId: reply.id,
        metadata: {
          leadId: reply.leadId,
          to: settings.ownerHotLeadEmail,
          providerMessageId: result.providerMessageId,
          dryRun: result.dryRun
        }
      }
    });
    return { sent: true, dryRun: result.dryRun };
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        action: "ai_assistant.hot_lead_alert_failed",
        entityType: "inbound_reply",
        entityId: reply.id,
        metadata: {
          leadId: reply.leadId,
          to: settings.ownerHotLeadEmail,
          error: error instanceof Error ? error.message : "Unknown error"
        }
      }
    });
    return { failed: true };
  }
}

export async function logAiAssistantDecision({
  replyId,
  draftId,
  leadId,
  decision,
  action = "ai_assistant.decision",
  metadata = {}
}: {
  replyId: string;
  draftId?: string | null;
  leadId?: string | null;
  decision: AiReplyDecision;
  action?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      action,
      entityType: "inbound_reply",
      entityId: replyId,
      metadata: {
        draftId,
        leadId,
        shouldAutoSend: decision.shouldAutoSend,
        shouldNotifyOwner: decision.shouldNotifyOwner,
        delaySeconds: decision.delaySeconds,
        mode: decision.mode,
        reasons: decision.reasons,
        ...metadata
      }
    }
  });
}

export async function recentAiAssistantActivity(limit = 20) {
  return prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          "reply.ai_classified",
          "reply.ai_draft_sent",
          "ai_assistant.decision",
          "ai_assistant.queued_decision",
          "ai_assistant.hot_lead_alert_sent",
          "ai_assistant.hot_lead_alert_failed",
          "email_reply.imap_poll_failed",
          "email_reply.imap_poll_processed"
        ]
      }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });
}

export function shouldNotifyOwnerForIntent(intent: ReplyIntent) {
  const ownerNotifyIntents: ReplyIntent[] = [
    ReplyIntent.HOT_LEAD,
    ReplyIntent.MEETING_REQUEST,
    ReplyIntent.PRICING_REQUEST
  ];
  return ownerNotifyIntents.includes(intent);
}

function parseChannel(value: unknown, fallback: { enabled: boolean; autoReply: boolean }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : fallback.enabled,
    autoReply: typeof record.autoReply === "boolean" ? record.autoReply : fallback.autoReply
  };
}

function parseHandoffIntents(value: unknown) {
  if (!Array.isArray(value)) return defaultAiAssistantSettings.handoffIntents;
  const valid = value.filter((item): item is ReplyIntent => Object.values(ReplyIntent).includes(item));
  return valid.length ? valid : defaultAiAssistantSettings.handoffIntents;
}

function numberInRange(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function stringArrayValue(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function normalizeTiming(timing: AiAssistantSettings["timing"]) {
  return {
    ...timing,
    maxReplyDelaySeconds: Math.max(timing.minReplyDelaySeconds, timing.maxReplyDelaySeconds)
  };
}

function randomDelaySeconds(settings: AiAssistantSettings) {
  const min = settings.timing.minReplyDelaySeconds;
  const max = settings.timing.maxReplyDelaySeconds;
  if (max <= min) return min;
  return Math.floor(min + Math.random() * (max - min + 1));
}
