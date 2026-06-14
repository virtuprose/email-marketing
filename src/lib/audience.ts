import { LeadStatus, Prisma } from "@prisma/client";

export const blockedLeadStatuses: LeadStatus[] = [
  LeadStatus.SUPPRESSED,
  LeadStatus.UNSUBSCRIBED,
  LeadStatus.BOUNCED,
  LeadStatus.DO_NOT_CONTACT,
  LeadStatus.LOST
];

export type LeadAudienceFilter = {
  status: LeadStatus | "ALL";
  tag?: string;
  country?: string;
  groupId?: string;
  maxRecipients: number;
};

export function emailAudienceWhere(filter: LeadAudienceFilter): Prisma.LeadWhereInput {
  return {
    deletedAt: null,
    status:
      filter.status === "ALL"
        ? { notIn: blockedLeadStatuses }
        : { equals: filter.status, notIn: blockedLeadStatuses },
    ...(filter.country ? { country: { contains: filter.country, mode: "insensitive" } } : {}),
    ...(filter.tag ? { tags: { some: { name: { equals: filter.tag, mode: "insensitive" } } } } : {}),
    ...(filter.groupId ? { groups: { some: { groupId: filter.groupId } } } : {})
  };
}

export function activeLeadWhere(where: Prisma.LeadWhereInput = {}): Prisma.LeadWhereInput {
  return { ...where, deletedAt: null };
}
