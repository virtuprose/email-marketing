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
  VALIDATED: "Ready",
  SUPPRESSED: "Do not contact",
  QUEUED: "Waiting to send",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  HOT: "Hot",
  NOT_INTERESTED: "Not interested",
  UNSUBSCRIBED: "Asked to stop",
  BOUNCED: "Email failed",
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
  REVIEW_BLOCKED: "Needs fixes",
  REVIEW_READY: "Ready to approve",
  APPROVED: "Approved",
  SCHEDULED: "Ready to send",
  SENDING: "Sending",
  PAUSED: "Paused",
  COMPLETED: "Finished",
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
  MEETING_REQUEST: "Wants a meeting",
  PRICING_REQUEST: "Asked for price",
  PORTFOLIO_REQUEST: "Asked for examples",
  OBJECTION: "Has a question",
  GENERAL_INTEREST: "Interested",
  NOT_INTERESTED: "Not interested",
  UNSUBSCRIBE: "Stop contacting",
  OUT_OF_OFFICE: "Out of office",
  WRONG_PERSON: "Wrong person",
  COMPLAINT: "Complaint risk",
  UNCLEAR: "Unsure"
};

export const replyStatusLabels: Record<ReplyStatus, string> = {
  NEW: "New",
  AI_CLASSIFIED: "AI reviewed",
  DRAFT_READY: "Ready reply",
  OWNER_REVIEW: "Needs you",
  HOT_HANDOFF: "Hot lead",
  AUTO_REPLIED: "AI replied",
  CLOSED: "Closed",
  SUPPRESSED: "Stopped"
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
  HOT: "Ready to contact",
  OWNER_HANDLING: "Needs you",
  PROPOSAL_SENT: "Proposal / pricing",
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
  UNKNOWN: "Needs permission",
  OPTED_IN: "Allowed on WhatsApp",
  STOPPED: "Stop contacting",
  INVALID: "Needs fixing"
};

export const whatsappTemplateStatusLabels: Record<WhatsappTemplateStatus, string> = {
  APPROVED: "Ready to use",
  PENDING: "Waiting for approval",
  REJECTED: "Needs changes",
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
  REVIEW_BLOCKED: "Needs fixes",
  REVIEW_READY: "Ready to approve",
  APPROVED: "Approved",
  SCHEDULED: "Ready to send",
  SENDING: "Sending",
  PAUSED: "Paused",
  COMPLETED: "Finished",
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
