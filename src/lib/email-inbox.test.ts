import { describe, expect, it } from "vitest";
import { replySkipReason } from "./email-inbox";

describe("email inbox reply filtering", () => {
  it("skips bulk and vendor system messages before they reach AI replies", () => {
    const headers = new Map<string, unknown>([
      ["list-unsubscribe", "<mailto:unsubscribe@example.com>"],
      ["x-mailer", "Customer.io"]
    ]);

    expect(
      replySkipReason({
        fromEmail: "updates@example.com",
        subject: "Apify spring updates",
        bodyText: "View in your browser. Manage your email preferences.",
        headers
      })
    ).toBe("bulk_or_list_message");
  });

  it("skips vendor marketing messages even without list headers", () => {
    expect(
      replySkipReason({
        fromEmail: "hello@apify.com",
        subject: "MCP connectors are here",
        bodyText: "Actors now work where you do. Apify spring updates. View this email in your browser.",
        headers: new Map()
      })
    ).toBe("system_or_marketing_message");
  });

  it("keeps normal human-looking replies eligible for processing", () => {
    expect(
      replySkipReason({
        fromEmail: "sara@example.com",
        subject: "Re: quick idea",
        bodyText: "Can you send examples for ecommerce projects?",
        headers: new Map()
      })
    ).toBeNull();
  });
});
