import { CampaignObjective, CampaignReviewSeverity, LeadStatus } from "@prisma/client";
import { z } from "zod";
import type { ComplianceSettings } from "./settings";

export type AudienceFilter = {
  status: LeadStatus | "ALL";
  tag?: string;
  country?: string;
  maxRecipients: number;
};

export type OfferForGeneration = {
  name: string;
  targetAudience: string;
  painPoints: string[];
  valueProposition: string;
  proofPoints: string[];
  servicesIncluded: string[];
  ctaStyle: string;
  disallowedClaims: string[];
  aiVoiceRules: string;
};

export type GeneratedCampaignSequence = {
  subject: string;
  body: string;
  followUpSteps: Array<{
    delayDays: number;
    subject: string;
    body: string;
  }>;
  personalizationFieldsUsed: string[];
  riskFlags: string[];
  claimsUsed: string[];
  confidence: number;
  explanation: string;
};

export type CampaignGenerationResult = GeneratedCampaignSequence & {
  provider: string;
  model: string;
};

export type CampaignReviewInput = {
  audienceCount: number;
  suppressedCount: number;
  missingComplianceCount: number;
  offer: OfferForGeneration;
  subjectBodies: Array<{ subject: string; body: string }>;
  compliance: ComplianceSettings;
};

export type CampaignReviewItem = {
  key: string;
  label: string;
  severity: CampaignReviewSeverity;
  message: string;
};

export const objectiveLabels: Record<CampaignObjective, string> = {
  AWARENESS: "Awareness",
  AUDIT_OFFER: "Audit offer",
  MEETING_REQUEST: "Meeting request",
  REACTIVATION: "Reactivation",
  FOLLOW_UP: "Follow-up",
  PROPOSAL: "Proposal"
};

export function generateCampaignSequence(
  offer: OfferForGeneration,
  objective: CampaignObjective
): GeneratedCampaignSequence {
  const primaryPain = offer.painPoints[0] ?? "unclear website or workflow issues";
  const proof = offer.proofPoints[0] ?? "approved Virtuprose work";
  const cta = offer.ctaStyle || "Ask if they want a short review";
  const objectiveLabel = objectiveLabels[objective].toLowerCase();

  return {
    subject: `Quick idea for {{company}}`,
    body: [
      "Hi {{first_name}},",
      "",
      `I noticed {{company}} may be a fit for Virtuprose's ${offer.name.toLowerCase()} work.`,
      `We usually help when teams are dealing with ${primaryPain.toLowerCase()}.`,
      "",
      offer.valueProposition,
      "",
      `If useful, I can send a short ${objectiveLabel} note with 2-3 practical improvement ideas.`,
      "",
      "Best,",
      "{{sender_name}}",
      "",
      "Unsubscribe: {{unsubscribe_url}}"
    ].join("\n"),
    followUpSteps: [
      {
        delayDays: 3,
        subject: `Re: quick idea for {{company}}`,
        body: [
          "Hi {{first_name}},",
          "",
          `Just following up in case ${offer.name.toLowerCase()} is relevant this quarter.`,
          `The main thing I would look for first is whether ${primaryPain.toLowerCase()} is costing you trust, time, or leads.`,
          "",
          `${cta}.`,
          "",
          "Best,",
          "{{sender_name}}",
          "",
          "Unsubscribe: {{unsubscribe_url}}"
        ].join("\n")
      },
      {
        delayDays: 7,
        subject: `Should I close the loop?`,
        body: [
          "Hi {{first_name}},",
          "",
          "I do not want to keep following up if this is not relevant.",
          `If ${offer.name.toLowerCase()} is worth exploring, reply with the best website or workflow to review and I will keep it concise.`,
          "",
          "Best,",
          "{{sender_name}}",
          "",
          "Unsubscribe: {{unsubscribe_url}}"
        ].join("\n")
      }
    ],
    personalizationFieldsUsed: ["first_name", "company", "sender_name", "unsubscribe_url"],
    riskFlags: ["Generated draft requires owner review before any send queue exists."],
    claimsUsed: proof ? [proof] : [],
    confidence: 78,
    explanation:
      "Generated from the selected Virtuprose offer, approved offer fields, conservative wording, and required unsubscribe placeholder."
  };
}

const aiSequenceSchema = z.object({
  subject: z.string().min(3),
  body: z.string().min(20),
  followUpSteps: z
    .array(
      z.object({
        delayDays: z.number().int().min(1).max(21),
        subject: z.string().min(3),
        body: z.string().min(20)
      })
    )
    .max(3),
  personalizationFieldsUsed: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  claimsUsed: z.array(z.string()).default([]),
  confidence: z.number().int().min(0).max(100),
  explanation: z.string().min(10)
});

export async function generateCampaignSequenceForOffer(
  offer: OfferForGeneration,
  objective: CampaignObjective
): Promise<CampaignGenerationResult> {
  const fallback = generateCampaignSequence(offer, objective);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_CAMPAIGN_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    return {
      ...fallback,
      provider: "local-rule-generator",
      model: "phase-2-campaign-draft-v1"
    };
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
            content:
              "You write compliant B2B outreach drafts for Virtuprose. Output only structured JSON. Use only provided offer facts, avoid fake familiarity, guaranteed outcomes, deceptive urgency, spammy pressure, or claims not in the offer. Every email body must include {{unsubscribe_url}} and {{sender_name}}."
          },
          {
            role: "user",
            content: JSON.stringify({
              objective,
              offer,
              requiredPersonalizationFields: ["first_name", "company", "sender_name", "unsubscribe_url"],
              maxFollowUps: 2,
              tone: "direct, useful, concise, low pressure"
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "campaign_sequence",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "subject",
                "body",
                "followUpSteps",
                "personalizationFieldsUsed",
                "riskFlags",
                "claimsUsed",
                "confidence",
                "explanation"
              ],
              properties: {
                subject: { type: "string" },
                body: { type: "string" },
                followUpSteps: {
                  type: "array",
                  maxItems: 2,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["delayDays", "subject", "body"],
                    properties: {
                      delayDays: { type: "integer", minimum: 1, maximum: 21 },
                      subject: { type: "string" },
                      body: { type: "string" }
                    }
                  }
                },
                personalizationFieldsUsed: {
                  type: "array",
                  items: { type: "string" }
                },
                riskFlags: {
                  type: "array",
                  items: { type: "string" }
                },
                claimsUsed: {
                  type: "array",
                  items: { type: "string" }
                },
                confidence: { type: "integer", minimum: 0, maximum: 100 },
                explanation: { type: "string" }
              }
            }
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI generation failed with ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    const outputText = extractOutputText(data);
    const parsed = aiSequenceSchema.parse(JSON.parse(outputText));

    return {
      ...parsed,
      provider: "openai",
      model
    };
  } catch {
    return {
      ...fallback,
      riskFlags: [...fallback.riskFlags, "OpenAI generation was unavailable; local fallback draft was used."],
      provider: "local-rule-generator",
      model: "phase-2-campaign-draft-v1"
    };
  }
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

export function reviewCampaign(input: CampaignReviewInput): CampaignReviewItem[] {
  const text = input.subjectBodies
    .map((item) => `${item.subject}\n${item.body}`)
    .join("\n")
    .toLowerCase();
  const items: CampaignReviewItem[] = [];

  items.push({
    key: "audience",
    label: "Audience selected",
    severity: input.audienceCount > 0 ? CampaignReviewSeverity.PASS : CampaignReviewSeverity.BLOCK,
    message:
      input.audienceCount > 0
        ? `${input.audienceCount} eligible recipient records are attached.`
        : "Select at least one eligible lead before approval."
  });

  items.push({
    key: "suppression",
    label: "Suppression check",
    severity: input.suppressedCount === 0 ? CampaignReviewSeverity.PASS : CampaignReviewSeverity.BLOCK,
    message:
      input.suppressedCount === 0
        ? "No suppressed leads are attached to this campaign."
        : `${input.suppressedCount} suppressed leads must be removed before approval.`
  });

  items.push({
    key: "lead_compliance",
    label: "Lead source and legal basis",
    severity: input.missingComplianceCount === 0 ? CampaignReviewSeverity.PASS : CampaignReviewSeverity.BLOCK,
    message:
      input.missingComplianceCount === 0
        ? "All selected leads have country, source, and legal-basis fields."
        : `${input.missingComplianceCount} selected leads are missing country, source, or legal-basis fields.`
  });

  const hasUnsubscribe = text.includes("{{unsubscribe_url}}") || text.includes("unsubscribe:");
  items.push({
    key: "unsubscribe",
    label: "Unsubscribe placeholder",
    severity: hasUnsubscribe ? CampaignReviewSeverity.PASS : CampaignReviewSeverity.BLOCK,
    message: hasUnsubscribe
      ? "Campaign copy includes an unsubscribe placeholder."
      : "Add {{unsubscribe_url}} or an unsubscribe line before approval."
  });

  const missingIdentity = [
    input.compliance.senderName ? null : "sender name",
    input.compliance.senderEmail ? null : "sender email",
    input.compliance.physicalAddress ? null : "physical address",
    input.compliance.unsubscribeUrl ? null : "unsubscribe URL"
  ].filter(Boolean);

  items.push({
    key: "sender_identity",
    label: "Sender identity settings",
    severity: missingIdentity.length === 0 ? CampaignReviewSeverity.PASS : CampaignReviewSeverity.BLOCK,
    message:
      missingIdentity.length === 0
        ? "Sender identity and unsubscribe URL are configured."
        : `Configure ${missingIdentity.join(", ")} in Settings before approval.`
  });

  const disallowedClaims = input.offer.disallowedClaims.filter(
    (claim) => claim && text.includes(claim.toLowerCase())
  );
  items.push({
    key: "claims",
    label: "Disallowed claims",
    severity: disallowedClaims.length === 0 ? CampaignReviewSeverity.PASS : CampaignReviewSeverity.BLOCK,
    message:
      disallowedClaims.length === 0
        ? "No disallowed offer claims were detected in the copy."
        : `Remove disallowed claim language: ${disallowedClaims.join(", ")}.`
  });

  const sequenceWarning = input.subjectBodies.length > 3;
  items.push({
    key: "sequence_length",
    label: "Sequence length",
    severity: sequenceWarning ? CampaignReviewSeverity.WARNING : CampaignReviewSeverity.PASS,
    message: sequenceWarning
      ? "Sequence is longer than the Phase 2 conservative default."
      : "Sequence length is within the Phase 2 conservative default."
  });

  return items;
}

export function campaignHasBlockers(items: CampaignReviewItem[]) {
  return items.some((item) => item.severity === CampaignReviewSeverity.BLOCK);
}
