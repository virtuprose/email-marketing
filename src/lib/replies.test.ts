import { DealStage, LeadStatus, ReplyIntent } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { analyzeReplyLocally, generateLocalReplyDraft } from "./replies";

const lead = {
  firstName: "Maya",
  company: "Example Co",
  email: "maya@example.com"
};

const offer = {
  name: "Website Redesign",
  valueProposition: "Virtuprose improves website clarity.",
  proofPoints: ["Approved portfolio examples"],
  ctaStyle: "Ask for website review"
};

describe("AI reply triage helpers", () => {
  it("keeps meeting requests replyable while marking the lead hot", () => {
    const analysis = analyzeReplyLocally({
      subject: "Re: quick idea",
      bodyText: "Sounds useful. Can we schedule a call this week?"
    });

    expect(analysis.intent).toBe(ReplyIntent.MEETING_REQUEST);
    expect(analysis.leadStatus).toBe(LeadStatus.HOT);
    expect(analysis.dealStage).toBe(DealStage.HOT);
    expect(analysis.ownerActionRequired).toBe(false);
    expect(analysis.autoReplyEligible).toBe(true);
  });

  it("blocks unsubscribe replies from AI follow-up", () => {
    const analysis = analyzeReplyLocally({
      subject: "Remove me",
      bodyText: "Please unsubscribe and stop emailing me."
    });
    const draft = generateLocalReplyDraft({
      reply: { subject: "Remove me", bodyText: "Please unsubscribe and stop emailing me." },
      lead,
      offer,
      analysis
    });

    expect(analysis.intent).toBe(ReplyIntent.UNSUBSCRIBE);
    expect(analysis.leadStatus).toBe(LeadStatus.UNSUBSCRIBED);
    expect(draft.riskFlags).toContain("Blocked by reply policy.");
  });

  it("drafts short proof replies with one qualifying question", () => {
    const analysis = analyzeReplyLocally({
      subject: "Re: examples",
      bodyText: "Can you send portfolio examples?"
    });
    const draft = generateLocalReplyDraft({
      reply: { subject: "Re: examples", bodyText: "Can you send portfolio examples?" },
      lead,
      offer,
      analysis
    });

    expect(analysis.intent).toBe(ReplyIntent.PORTFOLIO_REQUEST);
    expect(draft.bodyText).toContain("share relevant examples");
    expect(draft.bodyText).toContain("What kind of project");
    expect(draft.bodyText.split(/[.!?]/).filter(Boolean).length).toBeLessThanOrEqual(3);
  });

  it("treats simple greetings as safe WhatsApp-style interest", () => {
    const analysis = analyzeReplyLocally({
      subject: "WhatsApp reply",
      bodyText: "Hello, are you there?"
    });

    expect(analysis.intent).toBe(ReplyIntent.GENERAL_INTEREST);
    expect(analysis.autoReplyEligible).toBe(true);
    expect(analysis.confidence).toBeGreaterThanOrEqual(90);
    expect(analysis.ownerActionRequired).toBe(false);
  });

  it("marks custom project scope as a hot handoff", () => {
    const analysis = analyzeReplyLocally({
      subject: "Project",
      bodyText: "We have a project in mind and need an app for our ecommerce store."
    });

    expect(analysis.intent).toBe(ReplyIntent.HOT_LEAD);
    expect(analysis.leadStatus).toBe(LeadStatus.HOT);
    expect(analysis.ownerActionRequired).toBe(false);
    expect(analysis.autoReplyEligible).toBe(true);
  });

  it("does not treat vendor system emails as real sales replies", () => {
    const analysis = analyzeReplyLocally({
      subject: "Lead411 account activation confirmation",
      bodyText:
        "Hi Mohammad, your account has been activated with Lead411. View in your browser or manage your email preferences."
    });

    expect(analysis.intent).toBe(ReplyIntent.NON_SALES);
    expect(analysis.confidence).toBe(100);
    expect(analysis.ownerActionRequired).toBe(false);
    expect(analysis.autoReplyEligible).toBe(false);
  });
});
