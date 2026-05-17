import { CampaignObjective, CampaignReviewSeverity } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  campaignHasBlockers,
  generateCampaignSequence,
  generateCampaignSequenceForOffer,
  reviewCampaign
} from "./campaigns";

const offer = {
  name: "Website Redesign",
  targetAudience: "B2B companies",
  painPoints: ["Low trust"],
  valueProposition: "Virtuprose improves website clarity.",
  proofPoints: ["Approved proof only"],
  servicesIncluded: ["Audit"],
  ctaStyle: "Offer a website review",
  disallowedClaims: ["Guaranteed revenue"],
  aiVoiceRules: "Direct and useful"
};

describe("campaign generation and review", () => {
  it("generates a conservative sequence with unsubscribe placeholder", () => {
    const generated = generateCampaignSequence(offer, CampaignObjective.AUDIT_OFFER);

    expect(generated.subject).toContain("{{company}}");
    expect(generated.body).toContain("{{unsubscribe_url}}");
    expect(generated.followUpSteps).toHaveLength(2);
  });

  it("uses the local generator when no AI API key is configured", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const generated = await generateCampaignSequenceForOffer(offer, CampaignObjective.AUDIT_OFFER);

    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
    expect(generated.provider).toBe("local-rule-generator");
    expect(generated.body).toContain("{{unsubscribe_url}}");
  });

  it("blocks approval when identity, audience, or claims are unsafe", () => {
    const review = reviewCampaign({
      audienceCount: 0,
      suppressedCount: 1,
      missingComplianceCount: 2,
      offer,
      subjectBodies: [{ subject: "Hi", body: "Guaranteed revenue. Unsubscribe: {{unsubscribe_url}}" }],
      compliance: {}
    });

    expect(campaignHasBlockers(review)).toBe(true);
    expect(review.filter((item) => item.severity === CampaignReviewSeverity.BLOCK).length).toBeGreaterThan(1);
  });

  it("passes a conservative campaign with compliant settings", () => {
    const generated = generateCampaignSequence(offer, CampaignObjective.AUDIT_OFFER);
    const review = reviewCampaign({
      audienceCount: 3,
      suppressedCount: 0,
      missingComplianceCount: 0,
      offer,
      subjectBodies: [
        { subject: generated.subject, body: generated.body },
        ...generated.followUpSteps.map((step) => ({ subject: step.subject, body: step.body }))
      ],
      compliance: {
        senderName: "Virtuprose",
        senderEmail: "hello@virtuprose.com",
        physicalAddress: "Configured address",
        unsubscribeUrl: "https://virtuprose.com/unsubscribe"
      }
    });

    expect(campaignHasBlockers(review)).toBe(false);
  });
});
