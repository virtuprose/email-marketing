import { AiReplyDraftStatus, MessageChannel, ReplyIntent } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { decideAiReplyAutomation, defaultAiAssistantSettings } from "./ai-assistant";

const baseReply = {
  id: "reply-1",
  channel: MessageChannel.WHATSAPP,
  intent: ReplyIntent.PORTFOLIO_REQUEST,
  aiConfidence: 95,
  autoReplyEligible: true,
  riskFlags: [],
  ownerActionRequired: false
};

const baseLead = {
  id: "lead-1",
  aiAutoReplyPaused: false,
  whatsappBotPaused: false
};

const baseDraft = {
  id: "draft-1",
  status: AiReplyDraftStatus.DRAFT,
  riskFlags: []
};

describe("AI Assistant auto-reply decisions", () => {
  it("allows safe high-confidence WhatsApp replies", async () => {
    const decision = await decideAiReplyAutomation({
      reply: baseReply,
      lead: baseLead,
      draft: baseDraft,
      settings: {
        ...defaultAiAssistantSettings,
        timing: { ...defaultAiAssistantSettings.timing, minReplyDelaySeconds: 0, maxReplyDelaySeconds: 0 }
      },
      whatsappWindowOpen: true,
      openAiConfigured: true,
      existingOwnerReviewCount: 0,
      sentToday: 0,
      duplicateSentDraftCount: 0
    });

    expect(decision.shouldAutoSend).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it("allows safe WhatsApp replies at the default confidence floor", async () => {
    const decision = await decideAiReplyAutomation({
      reply: { ...baseReply, aiConfidence: 70 },
      lead: baseLead,
      draft: baseDraft,
      settings: {
        ...defaultAiAssistantSettings,
        timing: { ...defaultAiAssistantSettings.timing, minReplyDelaySeconds: 0, maxReplyDelaySeconds: 0 }
      },
      whatsappWindowOpen: true,
      openAiConfigured: true,
      existingOwnerReviewCount: 0,
      sentToday: 0,
      duplicateSentDraftCount: 0
    });

    expect(defaultAiAssistantSettings.confidence.autoSendMinimum).toBe(70);
    expect(decision.shouldAutoSend).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it("blocks safe replies below the default confidence floor", async () => {
    const decision = await decideAiReplyAutomation({
      reply: { ...baseReply, aiConfidence: 69 },
      lead: baseLead,
      draft: baseDraft,
      settings: defaultAiAssistantSettings,
      whatsappWindowOpen: true,
      openAiConfigured: true,
      existingOwnerReviewCount: 0,
      sentToday: 0,
      duplicateSentDraftCount: 0
    });

    expect(decision.shouldAutoSend).toBe(false);
    expect(decision.reasons).toContain("AI confidence is below auto-send level.");
  });

  it("blocks hot pricing replies for owner handoff", async () => {
    const decision = await decideAiReplyAutomation({
      reply: { ...baseReply, intent: ReplyIntent.PRICING_REQUEST, ownerActionRequired: true },
      lead: baseLead,
      draft: baseDraft,
      settings: defaultAiAssistantSettings,
      whatsappWindowOpen: true,
      openAiConfigured: true,
      existingOwnerReviewCount: 0,
      sentToday: 0,
      duplicateSentDraftCount: 0
    });

    expect(decision.shouldAutoSend).toBe(false);
    expect(decision.shouldNotifyOwner).toBe(true);
  });

  it("blocks when owner has taken over the lead", async () => {
    const decision = await decideAiReplyAutomation({
      reply: baseReply,
      lead: { ...baseLead, aiAutoReplyPaused: true },
      draft: baseDraft,
      settings: defaultAiAssistantSettings,
      whatsappWindowOpen: true,
      openAiConfigured: true,
      existingOwnerReviewCount: 0,
      sentToday: 0,
      duplicateSentDraftCount: 0
    });

    expect(decision.shouldAutoSend).toBe(false);
    expect(decision.reasons).toContain("AI is off for this lead.");
  });

  it("respects Draft Only and daily cap", async () => {
    const decision = await decideAiReplyAutomation({
      reply: baseReply,
      lead: baseLead,
      draft: baseDraft,
      settings: { ...defaultAiAssistantSettings, mode: "DRAFT_ONLY" },
      whatsappWindowOpen: true,
      openAiConfigured: true,
      existingOwnerReviewCount: 0,
      sentToday: defaultAiAssistantSettings.timing.dailyAutoReplyCap,
      duplicateSentDraftCount: 0
    });

    expect(decision.shouldAutoSend).toBe(false);
    expect(decision.reasons).toContain("Draft Only mode is on.");
    expect(decision.reasons).toContain("Daily AI reply limit has been reached.");
  });
});
