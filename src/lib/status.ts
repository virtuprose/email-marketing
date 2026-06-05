import {
  CampaignReviewSeverity,
  CampaignStatus,
  AiReplyDraftStatus,
  DealStage,
  DealStatus,
  EmailMessageStatus,
  ImportRowStatus,
  LeadStatus,
  ReplyIntent,
  ReplySentiment,
  ReplyStatus,
  SendJobStatus,
  SendingAccountStatus,
  SuppressionReason,
  WhatsappCampaignStatus,
  WhatsappLeadStatus,
  WhatsappMessageStatus,
  WhatsappRecipientStatus,
  WhatsappTemplateCategory,
  WhatsappTemplateStatus
} from "@prisma/client";

export const leadStatusLabels: Record<LeadStatus, string> = {
  NEW: "Needs review",
  VALIDATED: "Validated",
  SUPPRESSED: "Suppressed",
  QUEUED: "Queued",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  HOT: "Hot",
  NOT_INTERESTED: "Not interested",
  UNSUBSCRIBED: "Unsubscribed",
  BOUNCED: "Bounced",
  DO_NOT_CONTACT: "Do not contact",
  WON: "Won",
  LOST: "Lost"
};

export const importStatusLabels: Record<ImportRowStatus, string> = {
  IMPORTED: "Imported",
  FLAGGED: "Imported with flags",
  DUPLICATE: "Duplicate",
  INVALID: "Invalid",
  SUPPRESSED: "Suppressed",
  ROLLED_BACK: "Rolled back"
};

export const suppressionReasonLabels: Record<SuppressionReason, string> = {
  UNSUBSCRIBED: "Unsubscribed",
  COMPLAINT: "Complaint",
  HARD_BOUNCE: "Hard bounce",
  MANUAL_BLOCK: "Manual block",
  RISKY_DOMAIN: "Risky domain",
  COMPETITOR: "Competitor"
};

export const campaignStatusLabels: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  REVIEW_BLOCKED: "Review blocked",
  REVIEW_READY: "Ready to approve",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  SENDING: "Sending",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  ARCHIVED: "Archived"
};

export const campaignReviewSeverityLabels: Record<CampaignReviewSeverity, string> = {
  PASS: "Pass",
  WARNING: "Warning",
  BLOCK: "Blocker"
};

export const sendingAccountStatusLabels: Record<SendingAccountStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  AUTH_FAILED: "Auth failed",
  NOT_CONFIGURED: "Not configured"
};

export const sendJobStatusLabels: Record<SendJobStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled"
};

export const emailMessageStatusLabels: Record<EmailMessageStatus, string> = {
  QUEUED: "Queued",
  SENDING: "Sending",
  SENT: "Sent",
  SKIPPED: "Skipped",
  FAILED: "Failed"
};

export const replyIntentLabels: Record<ReplyIntent, string> = {
  HOT_LEAD: "Hot lead",
  MEETING_REQUEST: "Meeting request",
  PRICING_REQUEST: "Pricing request",
  PORTFOLIO_REQUEST: "Portfolio request",
  OBJECTION: "Objection or question",
  GENERAL_INTEREST: "Interested",
  NOT_INTERESTED: "Not interested",
  UNSUBSCRIBE: "Unsubscribe",
  OUT_OF_OFFICE: "Out of office",
  WRONG_PERSON: "Wrong person",
  COMPLAINT: "Complaint risk",
  UNCLEAR: "Needs review"
};

export const replyStatusLabels: Record<ReplyStatus, string> = {
  NEW: "New",
  AI_CLASSIFIED: "Classified",
  DRAFT_READY: "Draft ready",
  OWNER_REVIEW: "Owner review",
  HOT_HANDOFF: "Hot handoff",
  AUTO_REPLIED: "AI replied",
  CLOSED: "Closed",
  SUPPRESSED: "Suppressed"
};

export const replySentimentLabels: Record<ReplySentiment, string> = {
  POSITIVE: "Positive",
  NEUTRAL: "Neutral",
  NEGATIVE: "Negative"
};

export const aiReplyDraftStatusLabels: Record<AiReplyDraftStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  SENT: "Sent",
  DISCARDED: "Discarded",
  BLOCKED: "Blocked"
};

export const dealStageLabels: Record<DealStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  ENGAGED: "Engaged",
  HOT: "Hot",
  OWNER_HANDLING: "Owner handling",
  PROPOSAL_SENT: "Proposal sent",
  FOLLOW_UP_LATER: "Follow up later",
  WON: "Won",
  LOST: "Lost"
};

export const dealStatusLabels: Record<DealStatus, string> = {
  OPEN: "Open",
  WON: "Won",
  LOST: "Lost",
  PAUSED: "Paused"
};

export const whatsappLeadStatusLabels: Record<WhatsappLeadStatus, string> = {
  UNKNOWN: "Unknown",
  OPTED_IN: "Opted in",
  STOPPED: "Stopped",
  INVALID: "Invalid"
};

export const whatsappTemplateStatusLabels: Record<WhatsappTemplateStatus, string> = {
  APPROVED: "Approved",
  PENDING: "Pending",
  REJECTED: "Rejected",
  PAUSED: "Paused",
  DISABLED: "Disabled"
};

export const whatsappTemplateCategoryLabels: Record<WhatsappTemplateCategory, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
  SERVICE: "Service",
  UNKNOWN: "Unknown"
};

export const whatsappCampaignStatusLabels: Record<WhatsappCampaignStatus, string> = {
  DRAFT: "Draft",
  REVIEW_BLOCKED: "Review blocked",
  REVIEW_READY: "Ready to approve",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  SENDING: "Sending",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  ARCHIVED: "Archived"
};

export const whatsappRecipientStatusLabels: Record<WhatsappRecipientStatus, string> = {
  READY: "Ready",
  QUEUED: "Queued",
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
  REPLIED: "Replied",
  SKIPPED: "Skipped",
  FAILED: "Failed",
  EXCLUDED: "Excluded"
};

export const whatsappMessageStatusLabels: Record<WhatsappMessageStatus, string> = {
  QUEUED: "Queued",
  SENDING: "Sending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
  FAILED: "Failed",
  SKIPPED: "Skipped",
  REPLIED: "Replied"
};

export function statusTone(
  status:
    | AiReplyDraftStatus
    | LeadStatus
    | ImportRowStatus
    | SuppressionReason
    | CampaignStatus
    | CampaignReviewSeverity
    | SendingAccountStatus
    | SendJobStatus
    | EmailMessageStatus
    | ReplyIntent
    | ReplySentiment
    | ReplyStatus
    | DealStage
    | DealStatus
    | WhatsappCampaignStatus
    | WhatsappLeadStatus
    | WhatsappMessageStatus
    | WhatsappRecipientStatus
    | WhatsappTemplateStatus
) {
  if (
    [
      "HOT",
      "INTERESTED",
      "VALIDATED",
      "IMPORTED",
      "WON",
      "APPROVED",
      "REVIEW_READY",
      "COMPLETED",
      "ACTIVE",
      "SENT",
      "PASS",
      "HOT_LEAD",
      "MEETING_REQUEST",
      "PRICING_REQUEST",
      "PORTFOLIO_REQUEST",
      "GENERAL_INTEREST",
      "POSITIVE",
      "HOT_HANDOFF",
      "DRAFT_READY",
      "AUTO_REPLIED",
      "OWNER_HANDLING",
      "PROPOSAL_SENT",
      "OPEN",
      "OPTED_IN",
      "DELIVERED",
      "READ"
    ].includes(status)
  ) {
    return "success";
  }
  if (
    [
      "NEW",
      "FLAGGED",
      "QUEUED",
      "CONTACTED",
      "REPLIED",
      "DRAFT",
      "SCHEDULED",
      "SENDING",
      "RUNNING",
      "WARNING",
      "OBJECTION",
      "OUT_OF_OFFICE",
      "WRONG_PERSON",
      "UNCLEAR",
      "NEUTRAL",
      "AI_CLASSIFIED",
      "OWNER_REVIEW",
      "REPLIED",
      "ENGAGED",
      "FOLLOW_UP_LATER",
      "PAUSED",
      "UNKNOWN",
      "PENDING",
      "READY"
    ].includes(status)
  )
    return "warning";
  if (
    [
      "SUPPRESSED",
      "UNSUBSCRIBED",
      "BOUNCED",
      "DO_NOT_CONTACT",
      "INVALID",
      "COMPLAINT",
      "HARD_BOUNCE",
      "ROLLED_BACK",
      "REVIEW_BLOCKED",
      "PAUSED",
      "FAILED",
      "AUTH_FAILED",
      "NOT_CONFIGURED",
      "SKIPPED",
      "BLOCK",
      "BLOCKED",
      "DISCARDED",
      "COMPLAINT",
      "UNSUBSCRIBE",
      "NOT_INTERESTED",
      "NEGATIVE",
      "SUPPRESSED",
      "LOST",
      "STOPPED",
      "INVALID",
      "REJECTED",
      "DISABLED",
      "EXCLUDED"
    ].includes(status)
  ) {
    return "danger";
  }
  return "neutral";
}
