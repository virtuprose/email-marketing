import { describe, expect, it } from "vitest";
import { LeadStatus, WhatsappLeadStatus } from "@prisma/client";
import { createHmac } from "node:crypto";
import {
  isWhatsappOptOut,
  metaTemplateComponents,
  normalizeWhatsappPhone,
  renderWhatsappTemplateVariables,
  validateMetaWebhookSignature,
  verifyMetaWebhookChallenge,
  whatsappProfileNameForMessage,
  whatsappReadyReason
} from "./whatsapp";

describe("whatsapp helpers", () => {
  it("normalizes WhatsApp addresses", () => {
    expect(normalizeWhatsappPhone("whatsapp:+965 6000 0000")).toBe("+96560000000");
  });

  it("verifies Meta webhook challenge", () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-me";
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "verify-me",
      "hub.challenge": "12345"
    });

    expect(verifyMetaWebhookChallenge(params)).toBe("12345");
  });

  it("validates Meta webhook signatures", () => {
    process.env.META_APP_SECRET = "app-secret";
    const rawBody = JSON.stringify({ object: "whatsapp_business_account" });
    const signature = `sha256=${createHmac("sha256", "app-secret").update(rawBody).digest("hex")}`;

    expect(validateMetaWebhookSignature({ rawBody, signature })).toBe(true);
    expect(validateMetaWebhookSignature({ rawBody, signature: "sha256=invalid" })).toBe(false);
  });

  it("renders template variables from lead and offer fields", () => {
    const variables = renderWhatsappTemplateVariables({
      variables: ["1", "2"],
      mapping: { "1": "firstName", "2": "offerName" },
      lead: {
        firstName: "Aisha",
        lastName: null,
        company: "Example",
        website: null,
        role: null,
        country: "Kuwait"
      } as never,
      offer: {
        name: "Website audit",
        valueProposition: "Find conversion issues"
      } as never
    });

    expect(variables).toEqual({ "1": "Aisha", "2": "Website audit" });
  });

  it("builds Meta template body components from variables", () => {
    expect(metaTemplateComponents({ "2": "Audit", "1": "Aisha" })).toEqual({
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Aisha" },
            { type: "text", text: "Audit" }
          ]
        }
      ]
    });
  });

  it("blocks WhatsApp sends without opt-in", () => {
    expect(
      whatsappReadyReason({
        phoneE164: "+96560000000",
        whatsappOptIn: false,
        whatsappStatus: WhatsappLeadStatus.UNKNOWN,
        whatsappStoppedAt: null,
        status: LeadStatus.VALIDATED
      })
    ).toContain("opt-in");
  });

  it("detects WhatsApp opt-out language", () => {
    expect(isWhatsappOptOut("STOP")).toBe(true);
    expect(isWhatsappOptOut("please remove me")).toBe(true);
    expect(isWhatsappOptOut("send me details")).toBe(false);
  });

  it("matches Meta contact profile names to inbound WhatsApp numbers", () => {
    expect(
      whatsappProfileNameForMessage(
        [
          { wa_id: "96560000001", profile: { name: "Wrong Contact" } },
          { wa_id: "96560000000", profile: { name: "Aisha Al Kuwait" } }
        ],
        "+96560000000"
      )
    ).toBe("Aisha Al Kuwait");
  });
});
