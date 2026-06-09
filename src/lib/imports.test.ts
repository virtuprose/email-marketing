import { describe, expect, it } from "vitest";
import { ImportRowStatus } from "@prisma/client";
import {
  buildPreparedLead,
  classifyImportCandidate,
  guessMapping,
  isValidEmail,
  isValidE164,
  normalizeEmail,
  normalizePhoneE164
} from "./imports";
import { defaultImportMappingForRows, parseLeadImportText } from "./import-processing";

describe("lead import helpers", () => {
  it("normalizes and validates email addresses", () => {
    expect(normalizeEmail("  MOH@VIRTUPROSE.COM ")).toBe("moh@virtuprose.com");
    expect(isValidEmail("moh@virtuprose.com")).toBe(true);
    expect(isValidEmail("broken-email")).toBe(false);
  });

  it("normalizes and validates WhatsApp phone numbers", () => {
    expect(normalizePhoneE164("whatsapp:+1 (202) 555-0101")).toBe("+12025550101");
    expect(isValidE164("+12025550101")).toBe(true);
    expect(isValidE164("+1555")).toBe(false);
  });

  it("guesses common CSV headers", () => {
    const mapping = guessMapping(["Email Address", "Company Name", "Lead Source", "Legal Basis"]);

    expect(mapping.email).toBe("Email Address");
    expect(mapping.company).toBe("Company Name");
    expect(mapping.source).toBe("Lead Source");
    expect(mapping.legalBasis).toBe("Legal Basis");
  });

  it("parses Excel-style tab pasted rows with a header row", () => {
    const rows = parseLeadImportText(
      "email\tfirst_name\tcompany\tcountry\tsource\tpermission_reason\nfounder@example.com\tSara\tExample Co\tKuwait\tLinkedIn\tBusiness outreach"
    );
    const mapping = defaultImportMappingForRows(rows);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("founder@example.com");
    expect(rows[0]?.company).toBe("Example Co");
    expect(mapping.email).toBe("email");
    expect(mapping.company).toBe("company");
    expect(mapping.source).toBe("source");
  });

  it("flags rows missing compliance data", () => {
    const lead = buildPreparedLead(
      {
        email: "founder@example.com",
        company: "Example Co"
      },
      {
        email: "email",
        company: "company",
        country: "country",
        source: "source",
        legalBasis: "legal_basis"
      }
    );

    expect(lead.emailValid).toBe(true);
    expect(lead.issues).toContain("Missing country/region");
    expect(lead.issues).toContain("Missing lead source");
    expect(lead.issues).toContain("Missing legal basis");
  });

  it("classifies duplicates and suppressed rows before they can become leads", () => {
    const prepared = buildPreparedLead(
      {
        email: "founder@example.com",
        country: "United States",
        source: "manual",
        legal_basis: "legitimate interest"
      },
      {
        email: "email",
        country: "country",
        source: "source",
        legalBasis: "legal_basis"
      }
    );

    expect(
      classifyImportCandidate({
        prepared,
        seenInFile: new Set(["founder@example.com"]),
        existingEmails: new Set(),
        suppressedEmails: new Set()
      }).status
    ).toBe(ImportRowStatus.DUPLICATE);

    expect(
      classifyImportCandidate({
        prepared,
        seenInFile: new Set(),
        existingEmails: new Set(),
        suppressedEmails: new Set(["founder@example.com"])
      }).status
    ).toBe(ImportRowStatus.SUPPRESSED);
  });

  it("blocks duplicate WhatsApp phone numbers", () => {
    const prepared = buildPreparedLead(
      {
        email: "founder@example.com",
        phone: "+12025550101",
        country: "United States",
        source: "manual",
        legal_basis: "consent"
      },
      {
        email: "email",
        phone: "phone",
        country: "country",
        source: "source",
        legalBasis: "legal_basis"
      }
    );

    expect(
      classifyImportCandidate({
        prepared,
        seenInFile: new Set(),
        seenPhonesInFile: new Set(["+12025550101"]),
        existingEmails: new Set(),
        existingPhones: new Set(),
        suppressedEmails: new Set()
      }).status
    ).toBe(ImportRowStatus.DUPLICATE);
  });
});
