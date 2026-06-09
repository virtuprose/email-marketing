import {
  ConversationDirection,
  ConversationStatus,
  MeetingBookingStatus,
  MeetingSlotStatus,
  MessageChannel,
  Prisma,
  ReplyIntent,
  SalesLeadStage,
  type InboundReply,
  type Lead,
  type MeetingSlot
} from "@prisma/client";
import { isValidEmail, normalizeEmail, normalizePhoneE164 } from "@/lib/imports";
import { prisma } from "@/lib/prisma";

export type ContactDetails = {
  name?: string;
  email?: string;
  phoneE164?: string;
  company?: string;
};

export type SalesConversationSignals = {
  language: "en" | "ar";
  stage: SalesLeadStage;
  status: ConversationStatus;
  serviceNeeded: string | null;
  preferredMeetingTime: string | null;
  missingContactFields: string[];
  contactDetails: ContactDetails;
  ownerHandoffRequired: boolean;
  scoreFit: number;
  scoreEngagement: number;
  scoreIntent: number;
  totalScore: number;
};

export type MeetingSlotOption = {
  id: string;
  label: string;
  startAt: string;
  endAt: string;
  timezone: string;
};

type Tx = Prisma.TransactionClient | typeof prisma;

const meetingRequestTerms = [
  "meeting",
  "call",
  "zoom",
  "google meet",
  "book",
  "schedule",
  "available",
  "موعد",
  "اجتماع",
  "مكالمة",
  "اتصال",
  "زووم",
  "نرتب",
  "متاح"
];

export function detectConversationLanguage(text: string): "en" | "ar" {
  return /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
}

export function languageName(language: string | null | undefined) {
  return language === "ar" ? "Arabic" : "English";
}

export function extractContactDetails(text: string): ContactDetails {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phoneCandidate = text.match(/(?:\+|00)?\d[\d\s().-]{6,}\d/)?.[0];
  const phoneE164 = phoneCandidate ? normalizePhoneE164(phoneCandidate) : "";
  const name =
    text.match(/(?:my name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z\s.'-]{1,60})/i)?.[1]?.trim() ||
    text.match(/(?:اسمي|انا|أنا)\s+([\u0600-\u06FFA-Za-z\s.'-]{2,60})/)?.[1]?.trim();
  const company =
    text.match(/(?:company is|from|at)\s+([A-Za-z0-9&.,\-\s]{2,80})/i)?.[1]?.trim() ||
    text.match(/(?:شركة|من شركة)\s+([\u0600-\u06FFA-Za-z0-9&.,\-\s]{2,80})/)?.[1]?.trim();

  return {
    ...(name ? { name: cleanExtractedPhrase(name) } : {}),
    ...(email && isValidEmail(normalizeEmail(email)) ? { email: normalizeEmail(email) } : {}),
    ...(phoneE164 ? { phoneE164 } : {}),
    ...(company ? { company: cleanExtractedPhrase(company) } : {})
  };
}

export function inferServiceNeeded(text: string, fallback?: string | null) {
  const normalized = text.toLowerCase();
  if (matchesAny(normalized, ["ecommerce", "e-commerce", "shopify", "woocommerce", "متجر", "شوبيفاي"])) {
    return "Ecommerce / Shopify";
  }
  if (matchesAny(normalized, ["website", "web site", "landing page", "موقع", "ويب سايت"])) {
    return "Website";
  }
  if (matchesAny(normalized, ["mobile app", "application", "app", "تطبيق", "ابلكيشن"])) {
    return "Mobile app";
  }
  if (matchesAny(normalized, ["ai", "automation", "workflow", "chatbot", "واتساب", "أتمتة", "ذكاء"])) {
    return "AI automation";
  }
  if (matchesAny(normalized, ["marketing", "ads", "seo", "social media", "تسويق", "اعلانات", "إعلانات"])) {
    return "Digital marketing";
  }
  return fallback || null;
}

export function inferPreferredMeetingTime(text: string) {
  const normalized = text.trim();
  const explicit = normalized.match(
    /(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|\d{1,2}:\d{2}|\d{1,2}\s?(?:am|pm)|اليوم|باجر|غدا|غداً|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد|صباح|مساء)/i
  );
  if (!explicit) return null;
  return normalized.length > 120 ? normalized.slice(0, 120) : normalized;
}

export function buildSalesConversationSignals({
  reply,
  lead,
  intent,
  scoreIntent,
  scoreEngagement,
  fitScore
}: {
  reply: Pick<InboundReply, "bodyText" | "subject">;
  lead: Pick<
    Lead,
    | "firstName"
    | "lastName"
    | "email"
    | "phoneE164"
    | "company"
    | "website"
    | "role"
    | "industry"
    | "country"
    | "source"
    | "legalBasis"
    | "preferredLanguage"
    | "serviceNeeded"
    | "preferredMeetingTime"
  >;
  intent: ReplyIntent;
  scoreIntent: number;
  scoreEngagement: number;
  fitScore: number;
}): SalesConversationSignals {
  const text = `${reply.subject}\n${reply.bodyText}`;
  const language = detectConversationLanguage(text);
  const contactDetails = extractContactDetails(text);
  const serviceNeeded = inferServiceNeeded(text, lead.serviceNeeded);
  const preferredMeetingTime = inferPreferredMeetingTime(text) || lead.preferredMeetingTime;
  const meetingRequested =
    intent === ReplyIntent.MEETING_REQUEST || matchesAny(text.toLowerCase(), meetingRequestTerms);
  const stage = stageFromIntent({
    intent,
    meetingRequested,
    serviceNeeded,
    lead,
    contactDetails,
    preferredMeetingTime
  });
  const missingContactFields = missingFieldsForLead({
    lead,
    contactDetails,
    serviceNeeded,
    preferredMeetingTime
  });
  const scoreFit = Math.max(
    fitScore,
    serviceNeeded ? 70 : 0,
    lead.company || contactDetails.company ? 65 : 0
  );
  const normalizedIntent =
    stage === SalesLeadStage.MEETING_REQUESTED ? Math.max(scoreIntent, 92) : scoreIntent;
  const totalScore = Math.min(
    100,
    Math.round(scoreFit * 0.3 + scoreEngagement * 0.25 + normalizedIntent * 0.45)
  );

  return {
    language,
    stage,
    status:
      intent === ReplyIntent.UNSUBSCRIBE || intent === ReplyIntent.COMPLAINT
        ? ConversationStatus.SUPPRESSED
        : ownerHandoffForStage(stage, intent, totalScore)
          ? ConversationStatus.OWNER_HANDOFF
          : ConversationStatus.OPEN,
    serviceNeeded,
    preferredMeetingTime: preferredMeetingTime || null,
    missingContactFields,
    contactDetails,
    ownerHandoffRequired: ownerHandoffForStage(stage, intent, totalScore),
    scoreFit,
    scoreEngagement,
    scoreIntent: normalizedIntent,
    totalScore
  };
}

export async function findAvailableMeetingSlots(limit = 3, tx: Tx = prisma): Promise<MeetingSlotOption[]> {
  const slots = await tx.meetingSlot.findMany({
    where: {
      status: MeetingSlotStatus.AVAILABLE,
      startAt: { gte: new Date() }
    },
    orderBy: { startAt: "asc" },
    take: limit
  });
  return slots.map(formatMeetingSlotOption);
}

export function formatMeetingSlotOption(slot: Pick<MeetingSlot, "id" | "startAt" | "endAt" | "timezone">) {
  return {
    id: slot.id,
    label: formatSlotLabel(slot),
    startAt: slot.startAt.toISOString(),
    endAt: slot.endAt.toISOString(),
    timezone: slot.timezone
  };
}

export async function ensureConversationForLead({
  tx = prisma,
  leadId,
  channel,
  externalContactId,
  language,
  now = new Date()
}: {
  tx?: Tx;
  leadId: string;
  channel: MessageChannel;
  externalContactId?: string | null;
  language?: string | null;
  now?: Date;
}) {
  const existing = await tx.conversation.findFirst({
    where: {
      leadId,
      channel,
      ...(externalContactId ? { externalContactId } : {})
    },
    orderBy: { updatedAt: "desc" }
  });

  if (existing) {
    return tx.conversation.update({
      where: { id: existing.id },
      data: {
        language: language || existing.language,
        lastMessageAt: now
      }
    });
  }

  return tx.conversation.create({
    data: {
      leadId,
      channel,
      externalContactId: externalContactId || null,
      language: language || null,
      lastMessageAt: now
    }
  });
}

export async function recordConversationMessage({
  tx = prisma,
  conversationId,
  leadId,
  channel,
  direction,
  bodyText,
  language,
  providerMessageId,
  inboundReplyId,
  emailMessageId,
  whatsappMessageId,
  aiReplyDraftId,
  raw,
  createdAt = new Date()
}: {
  tx?: Tx;
  conversationId: string;
  leadId?: string | null;
  channel: MessageChannel;
  direction: ConversationDirection;
  bodyText: string;
  language?: string | null;
  providerMessageId?: string | null;
  inboundReplyId?: string | null;
  emailMessageId?: string | null;
  whatsappMessageId?: string | null;
  aiReplyDraftId?: string | null;
  raw?: Prisma.InputJsonValue;
  createdAt?: Date;
}) {
  if (providerMessageId) {
    const existing = await tx.conversationMessage.findUnique({ where: { providerMessageId } });
    if (existing) return existing;
  }

  return tx.conversationMessage.create({
    data: {
      conversationId,
      leadId: leadId || null,
      channel,
      direction,
      bodyText,
      language: language || null,
      providerMessageId: providerMessageId || null,
      inboundReplyId: inboundReplyId || null,
      emailMessageId: emailMessageId || null,
      whatsappMessageId: whatsappMessageId || null,
      aiReplyDraftId: aiReplyDraftId || null,
      ...(raw ? { raw } : {}),
      createdAt
    }
  });
}

export async function applyConversationSignals({
  tx = prisma,
  lead,
  conversationId,
  signals,
  replyId
}: {
  tx?: Tx;
  lead: Lead;
  conversationId: string;
  signals: SalesConversationSignals;
  replyId?: string;
}) {
  const nextLeadData: Prisma.LeadUpdateInput = {
    salesStage: signals.stage,
    preferredLanguage: signals.language,
    serviceNeeded: signals.serviceNeeded || lead.serviceNeeded,
    preferredMeetingTime: signals.preferredMeetingTime || lead.preferredMeetingTime,
    scoreFit: Math.max(lead.scoreFit, signals.scoreFit),
    scoreEngagement: Math.max(lead.scoreEngagement, signals.scoreEngagement),
    scoreIntent: Math.max(lead.scoreIntent, signals.scoreIntent)
  };

  if (!lead.firstName && signals.contactDetails.name) {
    const [firstName, ...rest] = signals.contactDetails.name.split(/\s+/);
    nextLeadData.firstName = firstName;
    if (!lead.lastName && rest.length) nextLeadData.lastName = rest.join(" ");
  }
  if (!lead.phoneE164 && signals.contactDetails.phoneE164) {
    const existingPhoneLead = await tx.lead.findUnique({
      where: { phoneE164: signals.contactDetails.phoneE164 }
    });
    if (!existingPhoneLead || existingPhoneLead.id === lead.id) {
      nextLeadData.phoneE164 = signals.contactDetails.phoneE164;
    }
  }
  if (!lead.company && signals.contactDetails.company) nextLeadData.company = signals.contactDetails.company;

  await tx.lead.update({
    where: { id: lead.id },
    data: nextLeadData
  });

  await tx.conversation.update({
    where: { id: conversationId },
    data: {
      language: signals.language,
      stage: signals.stage,
      status: signals.status,
      scoreFit: signals.scoreFit,
      scoreEngagement: signals.scoreEngagement,
      scoreIntent: signals.scoreIntent,
      totalScore: signals.totalScore,
      serviceNeeded: signals.serviceNeeded,
      preferredMeetingTime: signals.preferredMeetingTime,
      missingContactFields: signals.missingContactFields,
      ownerHandoffRequired: signals.ownerHandoffRequired,
      lastMessageAt: new Date()
    }
  });

  if (signals.stage === SalesLeadStage.MEETING_REQUESTED) {
    const existingOpenBooking = await tx.meetingBooking.findFirst({
      where: {
        leadId: lead.id,
        status: MeetingBookingStatus.REQUESTED
      },
      orderBy: { createdAt: "desc" }
    });
    const data = {
      conversationId,
      contactName:
        signals.contactDetails.name || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || null,
      phoneE164: signals.contactDetails.phoneE164 || lead.phoneE164,
      email: signals.contactDetails.email || lead.email,
      company: signals.contactDetails.company || lead.company,
      serviceNeeded: signals.serviceNeeded || lead.serviceNeeded,
      preferredTimeText: signals.preferredMeetingTime || (replyId ? `Requested from reply ${replyId}` : null)
    };
    if (existingOpenBooking) {
      await tx.meetingBooking.update({
        where: { id: existingOpenBooking.id },
        data
      });
    } else {
      await tx.meetingBooking.create({
        data: {
          leadId: lead.id,
          status: MeetingBookingStatus.REQUESTED,
          ...data
        }
      });
    }
  }
}

export function externalContactIdForReply(
  channel: MessageChannel,
  reply: Pick<InboundReply, "fromEmail" | "fromPhoneE164">
) {
  if (channel === MessageChannel.WHATSAPP) return reply.fromPhoneE164 || null;
  return reply.fromEmail || null;
}

function stageFromIntent({
  intent,
  meetingRequested,
  serviceNeeded,
  lead,
  contactDetails,
  preferredMeetingTime
}: {
  intent: ReplyIntent;
  meetingRequested: boolean;
  serviceNeeded: string | null;
  lead: Pick<Lead, "firstName" | "email" | "phoneE164" | "company">;
  contactDetails: ContactDetails;
  preferredMeetingTime: string | null | undefined;
}) {
  if (intent === ReplyIntent.NOT_INTERESTED) return SalesLeadStage.NOT_INTERESTED;
  if (intent === ReplyIntent.UNSUBSCRIBE || intent === ReplyIntent.COMPLAINT)
    return SalesLeadStage.NOT_INTERESTED;
  if (meetingRequested) return SalesLeadStage.MEETING_REQUESTED;

  const hasContact = Boolean(
    contactDetails.phoneE164 || contactDetails.email || lead.phoneE164 || validLeadEmail(lead.email)
  );
  const hasBusiness = Boolean(
    serviceNeeded && (lead.company || contactDetails.company || preferredMeetingTime)
  );
  if (intent === ReplyIntent.HOT_LEAD || (hasContact && hasBusiness)) return SalesLeadStage.QUALIFIED_LEAD;
  if (
    intent === ReplyIntent.GENERAL_INTEREST ||
    intent === ReplyIntent.PRICING_REQUEST ||
    intent === ReplyIntent.PORTFOLIO_REQUEST ||
    intent === ReplyIntent.OBJECTION
  ) {
    return SalesLeadStage.INTERESTED;
  }
  return SalesLeadStage.NEW_ENQUIRY;
}

function missingFieldsForLead({
  lead,
  contactDetails,
  serviceNeeded,
  preferredMeetingTime
}: {
  lead: Pick<Lead, "firstName" | "email" | "phoneE164" | "company">;
  contactDetails: ContactDetails;
  serviceNeeded: string | null;
  preferredMeetingTime?: string | null;
}) {
  const missing: string[] = [];
  if (!lead.firstName && !contactDetails.name) missing.push("name");
  if (!lead.phoneE164 && !contactDetails.phoneE164) missing.push("phone");
  if (!validLeadEmail(lead.email) && !contactDetails.email) missing.push("email");
  if (!lead.company && !contactDetails.company) missing.push("company");
  if (!serviceNeeded) missing.push("service/product needed");
  if (!preferredMeetingTime) missing.push("preferred meeting time");
  return missing;
}

function validLeadEmail(email: string | null | undefined) {
  return Boolean(email && isValidEmail(email) && !email.endsWith("@whatsapp.local"));
}

function ownerHandoffForStage(stage: SalesLeadStage, intent: ReplyIntent, totalScore: number) {
  return (
    stage === SalesLeadStage.MEETING_REQUESTED ||
    stage === SalesLeadStage.MEETING_BOOKED ||
    intent === ReplyIntent.HOT_LEAD ||
    intent === ReplyIntent.PRICING_REQUEST ||
    totalScore >= 80
  );
}

function formatSlotLabel(slot: Pick<MeetingSlot, "startAt" | "endAt" | "timezone">) {
  const formatter = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: slot.timezone
  });
  return `${formatter.format(slot.startAt)} ${slot.timezone}`;
}

function cleanExtractedPhrase(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[.,؛،]+$/g, "")
    .trim()
    .slice(0, 80);
}

function matchesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}
