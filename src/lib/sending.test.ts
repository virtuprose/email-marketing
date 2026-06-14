import { describe, expect, it } from "vitest";
import { renderEmailCopy } from "./sending";

describe("email sending personalization", () => {
  it("renders website audit personalization tokens", () => {
    const rendered = renderEmailCopy({
      subject: "{{audit_email_subject}}",
      body: "Hi {{first_name}}, I reviewed {{website}} and noticed {{audit_pain_point}}. {{mobile_app_signal}}",
      lead: {
        firstName: "Sara",
        company: "Growth Studio",
        email: "sara@example.com",
        website: "https://growthstudio.example"
      },
      senderName: "Virtuprose",
      unsubscribeUrl: "https://sales.virtuprose.com/unsubscribe/test",
      personalization: {
        audit_email_subject: "Quick idea for Growth Studio",
        audit_pain_point: "no clear booking path",
        mobile_app_signal: "There may also be a mobile app opportunity because repeat customer workflow is visible."
      }
    });

    expect(rendered.subject).toBe("Quick idea for Growth Studio");
    expect(rendered.bodyText).toContain("https://growthstudio.example");
    expect(rendered.bodyText).toContain("no clear booking path");
    expect(rendered.bodyText).not.toContain("{{audit_pain_point}}");
  });
});
