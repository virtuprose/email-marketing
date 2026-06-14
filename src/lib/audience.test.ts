import { LeadStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { emailAudienceWhere } from "./audience";

describe("email audience filters", () => {
  it("limits campaigns to active group members while excluding blocked statuses", () => {
    expect(
      emailAudienceWhere({
        status: "ALL",
        groupId: "group_123",
        tag: "ecommerce",
        country: "Kuwait",
        maxRecipients: 100
      })
    ).toMatchObject({
      deletedAt: null,
      status: { notIn: expect.arrayContaining([LeadStatus.SUPPRESSED, LeadStatus.UNSUBSCRIBED]) },
      groups: { some: { groupId: "group_123" } },
      tags: { some: { name: { equals: "ecommerce", mode: "insensitive" } } },
      country: { contains: "Kuwait", mode: "insensitive" }
    });
  });

  it("keeps a selected status inside the blocked-status guard", () => {
    expect(emailAudienceWhere({ status: LeadStatus.VALIDATED, maxRecipients: 25 })).toMatchObject({
      deletedAt: null,
      status: { equals: LeadStatus.VALIDATED, notIn: expect.any(Array) }
    });
  });
});
