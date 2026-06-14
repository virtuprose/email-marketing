import { describe, expect, it } from "vitest";
import {
  analyzeWebsiteLocally,
  campaignStepForWebsiteAudit,
  dedupeWebsiteRows,
  parseWebsiteRows,
  websiteAuditPersonalization
} from "./website-audit";

describe("website audit campaign helpers", () => {
  it("parses and dedupes website rows", () => {
    const rows = dedupeWebsiteRows(
      parseWebsiteRows(
        ["website,company,email,country", "example.com,Example,hello@example.com,UAE", "https://www.example.com/contact"].join(
          "\n"
        )
      )
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].normalizedDomain).toBe("example.com");
    expect(rows[0].email).toBe("hello@example.com");
  });

  it("scores mobile app opportunity from repeat-use website signals", () => {
    const analysis = analyzeWebsiteLocally({
      websiteUrl: "https://clinic.example",
      pages: [
        {
          url: "https://clinic.example",
          title: "Example Clinic",
          text: "Book appointments online. Members can login, track order status, use loyalty rewards, manage bookings, and place online orders for delivery.",
          html: "<a href='/booking'>Booking</a><a href='/account'>Account</a> info@clinic.example"
        }
      ],
      offer: { name: "Mobile App Development", valueProposition: "Build practical apps." }
    });

    expect(analysis.publicEmail).toBe("info@clinic.example");
    expect(analysis.mobileAppOpportunityScore).toBeGreaterThanOrEqual(70);
    expect(analysis.recommendedService.toLowerCase()).toContain("mobile");
  });

  it("creates audit personalization and campaign tokens", () => {
    const personalization = websiteAuditPersonalization({
      offer: { name: "Website Improvement" },
      candidate: {
        websiteUrl: "https://shop.example",
        painPoints: ["Customers may not have a simple booking path."],
        missingFeatures: ["Online booking"],
        evidence: { items: ["No booking link found."] },
        mobileAppScore: 80,
        mobileAppSignals: ["Repeat customer account workflow is visible."],
        recommendedServiceName: "Booking and website improvement",
        generatedSubject: "Quick idea for {{company}}",
        generatedBody: "Hi {{first_name}},\n\nI reviewed {{website}}."
      }
    });
    const step = campaignStepForWebsiteAudit();

    expect(step.subject).toContain("{{audit_email_subject}}");
    expect(step.body).toContain("{{audit_email_body}}");
    expect(personalization.mobile_app_signal).toContain("Repeat customer");
  });
});
