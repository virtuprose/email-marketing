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
  it("marks meeting requests as hot owner handoffs", () => {
    const analysis = analyzeReplyLocally({
      subject: "Re: quick idea",
      bodyText: "Sounds useful. Can we schedule a call this week?"
    });

    expect(analysis.intent).toBe(ReplyIntent.MEETING_REQUEST);
    expect(analysis.leadStatus).toBe(LeadStatus.HOT);
    expect(analysis.dealStage).toBe(DealStage.HOT);
    expect(analysis.ownerActionRequired).toBe(true);
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

  it("drafts proof replies using approved offer facts", () => {
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
    expect(draft.bodyText).toContain("Approved portfolio examples");
    expect(draft.bodyText).toContain("If this is not useful");
  });

  it("marks custom project scope as a hot handoff", () => {
    const analysis = analyzeReplyLocally({
      subject: "Project",
      bodyText: "We have a project in mind and need an app for our ecommerce store."
    });

    expect(analysis.intent).toBe(ReplyIntent.HOT_LEAD);
    expect(analysis.leadStatus).toBe(LeadStatus.HOT);
    expect(analysis.ownerActionRequired).toBe(true);
  });
});
