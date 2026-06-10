import {
  AiReplyDraftStatus,
  MeetingSlotStatus,
  MessageChannel,
  Prisma,
  ReplyIntent,
  ReplyStatus,
  SendingAccountStatus
} from "@prisma/client";
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  CheckCircle2,
  Flame,
  Inbox,
  Mail,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  UserCheck
} from "lucide-react";
import Link from "next/link";
import {
  bookMeetingSlotForReply,
  closeInboundReply,
  createManualInboundReply,
  markInboundReplyHot,
  pauseAiForLeadAction,
  reprocessInboundReply,
  resumeAiForLeadAction,
  sendAiReplyDraftAction
} from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  aiReplyDraftStatusLabels,
  leadStatusLabels,
  replyIntentLabels,
  replySentimentLabels,
  replyStatusLabels,
  sendingAccountStatusLabels
} from "@/lib/status";

export const dynamic = "force-dynamic";

type InboxPageProps = {
  searchParams: Promise<{
    selected?: string;
    intent?: string;
    status?: string;
  }>;
};

const replyInclude = {
  lead: {
    include: {
      meetingBookings: { include: { slot: true }, orderBy: { createdAt: "desc" }, take: 2 }
    }
  },
  conversation: { include: { messages: { orderBy: { createdAt: "desc" }, take: 8 } } },
  campaign: { include: { offer: true } },
  drafts: { orderBy: { createdAt: "desc" }, take: 1 }
} satisfies Prisma.InboundReplyInclude;

type ReplyDetail = Prisma.InboundReplyGetPayload<{ include: typeof replyInclude }>;

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const params = await searchParams;
  const where: Prisma.InboundReplyWhereInput = {};

  if (params.intent && params.intent in ReplyIntent) {
    where.intent = params.intent as ReplyIntent;
  }
  if (params.status && params.status in ReplyStatus) {
    where.status = params.status as ReplyStatus;
  }

  const [replies, selectedReply, counts, sendingAccounts, availableSlots] = await Promise.all([
    prisma.inboundReply.findMany({
      where,
      include: replyInclude,
      orderBy: { receivedAt: "desc" },
      take: 75
    }),
    params.selected
      ? prisma.inboundReply.findUnique({
          where: { id: params.selected },
          include: replyInclude
        })
      : null,
    getInboxCounts(),
    prisma.sendingAccount.findMany({
      where: { status: SendingAccountStatus.ACTIVE },
      orderBy: { createdAt: "asc" }
    }),
    prisma.meetingSlot.findMany({
      where: { status: MeetingSlotStatus.AVAILABLE, startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      take: 3
    })
  ]);

  const activeReply = selectedReply ?? replies[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Replies"
        title="Reply command center"
        description="See every captured reply, what AI understood, and the next action to move the lead forward."
        actions={
          <Link className="secondary-button" href="/pipeline">
            <UserCheck size={16} aria-hidden="true" /> View Hot Leads
          </Link>
        }
      />

      <section className="grid grid-4" aria-label="Inbox metrics">
        <Metric icon={<Inbox size={18} />} label="Captured" value={counts.total} note="Email and WhatsApp" />
        <Metric icon={<Flame size={18} />} label="Hot leads" value={counts.hot} note="Prioritize these" />
        <Metric
          icon={<Sparkles size={18} />}
          label="Draft ready"
          value={counts.draftReady}
          note="Review or send"
        />
        <Metric
          icon={<Bot size={18} />}
          label="Needs you"
          value={counts.ownerReview}
          note="AI wants your decision"
        />
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <ManualReplyPanel />
        <FilterPanel params={params} />
      </section>

      <div className="split-layout inbox-layout" style={{ marginTop: 16 }}>
        <section className="panel" aria-label="Reply list">
          <div className="panel-header">
            <div>
              <h2>Replies</h2>
              <p className="muted">Showing latest {formatNumber(replies.length)} matching replies.</p>
            </div>
          </div>
          <div className="panel-body stack">
            {replies.length ? (
              replies.map((reply) => (
                <ReplyQueueItem
                  key={reply.id}
                  reply={reply}
                  selected={activeReply?.id === reply.id}
                  href={`/inbox?selected=${reply.id}${params.intent ? `&intent=${params.intent}` : ""}${
                    params.status ? `&status=${params.status}` : ""
                  }`}
                />
              ))
            ) : (
              <div className="empty-state">No replies match this view yet.</div>
            )}
          </div>
        </section>

        <ReplyDetailPanel
          reply={activeReply}
          sendingAccounts={sendingAccounts}
          availableSlots={availableSlots}
        />
      </div>
    </>
  );
}

function ReplyQueueItem({ reply, href, selected }: { reply: ReplyDetail; href: string; selected: boolean }) {
  const draft = reply.drafts[0];
  const action = replyActionLabel(reply, draft);
  return (
    <Link
      className={`reply-list-item reply-work-item${selected ? " reply-list-item-active" : ""}`}
      href={href}
      aria-current={selected ? "page" : undefined}
    >
      <span className="reply-channel-icon" aria-hidden="true">
        {reply.channel === MessageChannel.WHATSAPP ? <MessageCircle size={17} /> : <Mail size={17} />}
      </span>
      <span className="reply-list-main">
        <strong>{replyLeadName(reply)}</strong>
        <span>{replyPreview(reply)}</span>
        <span className="reply-contact-line">{replyContact(reply)}</span>
      </span>
      <span className="reply-list-meta">
        <StatusBadge label={replyIntentLabels[reply.intent]} status={reply.intent} />
        <span>{action}</span>
        <span>{formatDate(reply.receivedAt)}</span>
      </span>
    </Link>
  );
}

async function getInboxCounts() {
  const [total, hot, draftReady, ownerReview] = await Promise.all([
    prisma.inboundReply.count(),
    prisma.inboundReply.count({ where: { status: ReplyStatus.HOT_HANDOFF } }),
    prisma.inboundReply.count({ where: { status: ReplyStatus.DRAFT_READY } }),
    prisma.inboundReply.count({ where: { ownerActionRequired: true } })
  ]);

  return { total, hot, draftReady, ownerReview };
}

function ManualReplyPanel() {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Add a reply manually</h2>
          <p className="muted">Paste a client message when automatic inbox connection is not ready.</p>
        </div>
      </div>
      <div className="panel-body">
        <form action={createManualInboundReply} className="stack">
          <div className="form-grid">
            <label className="field">
              <span>Lead email</span>
              <input
                className="input"
                name="fromEmail"
                type="email"
                required
                placeholder="lead@company.com"
              />
            </label>
            <label className="field">
              <span>Your email</span>
              <input className="input" name="toEmail" type="email" placeholder="hello@virtuprose.com" />
            </label>
          </div>
          <label className="field">
            <span>Subject</span>
            <input className="input" name="subject" required placeholder="Re: quick idea" />
          </label>
          <label className="field">
            <span>What they said</span>
            <textarea
              className="textarea"
              name="bodyText"
              required
              placeholder="Paste the lead reply here."
            />
          </label>
          <button className="button" type="submit">
            <Sparkles size={16} aria-hidden="true" /> Let AI read it
          </button>
        </form>
      </div>
    </section>
  );
}

function FilterPanel({ params }: { params: { intent?: string; status?: string } }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Find replies</h2>
          <p className="muted">Filter by what the lead wants or where the reply stands.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="form-grid" action="/inbox">
          <label className="field">
            <span>What they want</span>
            <select className="select" name="intent" defaultValue={params.intent ?? ""}>
              <option value="">All reply types</option>
              {Object.values(ReplyIntent).map((intent) => (
                <option key={intent} value={intent}>
                  {replyIntentLabels[intent]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reply stage</span>
            <select className="select" name="status" defaultValue={params.status ?? ""}>
              <option value="">All stages</option>
              {Object.values(ReplyStatus).map((status) => (
                <option key={status} value={status}>
                  {replyStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="submit">
            Show replies
          </button>
        </form>
      </div>
    </section>
  );
}

function ReplyDetailPanel({
  reply,
  sendingAccounts,
  availableSlots
}: {
  reply: ReplyDetail | null;
  sendingAccounts: Array<{ id: string; name: string; dryRun: boolean; status: SendingAccountStatus }>;
  availableSlots: Array<{ id: string; startAt: Date; endAt: Date; timezone: string }>;
}) {
  if (!reply) {
    return (
      <aside className="panel">
        <div className="panel-body empty-state">Add or select a reply to see what AI recommends.</div>
      </aside>
    );
  }

  const draft = reply.drafts[0];
  const canSendDraft = draft && draft.status === AiReplyDraftStatus.DRAFT && sendingAccounts.length > 0;
  const aiPaused = Boolean(reply.lead?.aiAutoReplyPaused);
  const nextAction = replyActionLabel(reply, draft);

  return (
    <aside className="panel reply-detail-panel">
      <div className="panel-header reply-detail-header">
        <div className="reply-detail-heading">
          <span className="reply-channel-icon large" aria-hidden="true">
            {reply.channel === MessageChannel.WHATSAPP ? <MessageCircle size={20} /> : <Mail size={20} />}
          </span>
          <div>
            <h2>{replyLeadName(reply)}</h2>
            <p className="muted">{replyContact(reply)}</p>
          </div>
        </div>
        <StatusBadge label={replyStatusLabels[reply.status]} status={reply.status} />
      </div>
      <div className="panel-body stack">
        <div className="reply-action-card">
          <div>
            <span className="reply-action-eyebrow">Next action</span>
            <strong>{nextAction}</strong>
            <p>
              {reply.aiSuggestedAction ||
                reply.aiSummary ||
                "Review the latest message and decide whether to send the AI draft or close it."}
            </p>
          </div>
          {reply.ownerActionRequired ? (
            <AlertTriangle size={20} aria-label="Needs owner review" />
          ) : draft?.status === AiReplyDraftStatus.SENT || reply.status === ReplyStatus.AUTO_REPLIED ? (
            <CheckCircle2 size={20} aria-label="AI replied" />
          ) : (
            <Sparkles size={20} aria-label="AI prepared" />
          )}
        </div>

        <div className="grid grid-4 reply-signal-grid">
          <MiniMetric label="What they want" value={replyIntentLabels[reply.intent]} status={reply.intent} />
          <MiniMetric
            label="Sales stage"
            value={salesStageLabel(reply.salesStage ?? reply.lead?.salesStage)}
          />
          <MiniMetric label="Tone" value={replySentimentLabels[reply.sentiment]} status={reply.sentiment} />
          <MiniMetric label="AI confidence" value={confidenceLabel(reply.aiConfidence)} />
        </div>

        <div className="reply-section">
          <div className="reply-section-header">
            <h3>Customer message</h3>
            <span>{formatDate(reply.receivedAt)}</span>
          </div>
          <pre className="email-preview readable-preview">{reply.bodyText}</pre>
        </div>

        <div className="reply-section">
          <div className="reply-section-header">
            <h3>AI draft</h3>
            {draft ? (
              <StatusBadge label={aiReplyDraftStatusLabels[draft.status]} status={draft.status} />
            ) : null}
          </div>
          {draft ? (
            <div className="stack" style={{ marginTop: 8 }}>
              {draft.subject ? <p className="reply-draft-subject">{draft.subject}</p> : null}
              <pre className="email-preview readable-preview">{draft.bodyText}</pre>
              {draft.riskFlags.length ? (
                <div className="tag-list">
                  {draft.riskFlags.map((flag) => (
                    <span className="tag" key={flag}>
                      {flag}
                    </span>
                  ))}
                </div>
              ) : null}
              {canSendDraft ? (
                <form action={sendAiReplyDraftAction} className="reply-send-form">
                  <input type="hidden" name="draftId" value={draft.id} />
                  <input type="hidden" name="replyId" value={reply.id} />
                  <label className="field">
                    <span>Send from</span>
                    <select className="select" name="sendingAccountId">
                      {sendingAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} -{" "}
                          {account.dryRun ? "test mode" : sendingAccountStatusLabels[account.status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button" type="submit">
                    <Send size={16} aria-hidden="true" /> Send AI reply
                  </button>
                </form>
              ) : null}
            </div>
          ) : (
            <p className="muted">No AI draft exists for this reply.</p>
          )}
        </div>

        <ConversationTimeline reply={reply} />

        <MeetingBookingPanel reply={reply} availableSlots={availableSlots} />

        <details className="advanced-inline reply-details-more">
          <summary>Lead and AI details</summary>
          <div className="profile-list">
            <ProfileRow
              label="Contact status"
              value={reply.lead ? leadStatusLabels[reply.lead.status] : "Unknown"}
            />
            <ProfileRow label="Campaign" value={reply.campaign?.name || "Not matched"} />
            <ProfileRow label="Service" value={reply.campaign?.offer.name || "Not matched"} />
            <ProfileRow label="Language" value={reply.language === "ar" ? "Arabic" : "English"} />
            <ProfileRow
              label="Missing details"
              value={reply.missingContactFields.length ? reply.missingContactFields.join(", ") : "None"}
            />
            <ProfileRow
              label="AI for this lead"
              value={aiPaused ? "You are handling this lead" : "AI can help"}
            />
          </div>
        </details>

        <div className="stack">
          <div className="toolbar" style={{ marginBottom: 0 }}>
            {reply.lead ? (
              aiPaused ? (
                <form action={resumeAiForLeadAction}>
                  <input type="hidden" name="leadId" value={reply.lead.id} />
                  <input type="hidden" name="replyId" value={reply.id} />
                  <input type="hidden" name="returnTo" value={`/inbox?selected=${reply.id}`} />
                  <button className="secondary-button" type="submit">
                    Turn AI back on
                  </button>
                </form>
              ) : (
                <form action={pauseAiForLeadAction}>
                  <input type="hidden" name="leadId" value={reply.lead.id} />
                  <input type="hidden" name="replyId" value={reply.id} />
                  <input type="hidden" name="returnTo" value={`/inbox?selected=${reply.id}`} />
                  <button className="secondary-button" type="submit">
                    AI off for this lead
                  </button>
                </form>
              )
            ) : null}
            <form action={markInboundReplyHot}>
              <input type="hidden" name="replyId" value={reply.id} />
              <button className="secondary-button" type="submit">
                <Flame size={16} aria-hidden="true" /> Mark as hot
              </button>
            </form>
            <form action={reprocessInboundReply}>
              <input type="hidden" name="replyId" value={reply.id} />
              <button className="secondary-button" type="submit">
                <RotateCcw size={16} aria-hidden="true" /> Ask AI again
              </button>
            </form>
            <form action={closeInboundReply}>
              <input type="hidden" name="replyId" value={reply.id} />
              <button className="secondary-button" type="submit">
                I handled this
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ConversationTimeline({ reply }: { reply: ReplyDetail }) {
  const messages = reply.conversation?.messages.slice().reverse() ?? [];
  return (
    <div className="reply-section">
      <div className="reply-section-header">
        <h3>Saved conversation</h3>
        <span>{messages.length ? `${messages.length} messages` : "No history yet"}</span>
      </div>
      <div className="conversation-timeline">
        {messages.length ? (
          messages.map((message) => (
            <div className={`conversation-message ${message.direction.toLowerCase()}`} key={message.id}>
              <span>{message.direction === "INBOUND" ? "Customer" : "Assistant"}</span>
              <p>{message.bodyText}</p>
              <small>{formatDate(message.createdAt)}</small>
            </div>
          ))
        ) : (
          <p className="muted">No saved history yet.</p>
        )}
      </div>
    </div>
  );
}

function MeetingBookingPanel({
  reply,
  availableSlots
}: {
  reply: ReplyDetail;
  availableSlots: Array<{ id: string; startAt: Date; endAt: Date; timezone: string }>;
}) {
  const latestBooking = reply.lead?.meetingBookings[0];
  return (
    <div className="alert">
      <strong>
        <CalendarDays size={16} aria-hidden="true" /> Meeting
      </strong>
      {latestBooking ? (
        <p>
          {latestBooking.status.replaceAll("_", " ").toLowerCase()} -{" "}
          {latestBooking.slot
            ? formatSlot(latestBooking.slot)
            : latestBooking.preferredTimeText || "time not set"}
        </p>
      ) : (
        <p>No meeting booked yet.</p>
      )}
      {availableSlots.length ? (
        <form action={bookMeetingSlotForReply} className="form-grid">
          <input type="hidden" name="replyId" value={reply.id} />
          <input type="hidden" name="returnTo" value={`/inbox?selected=${reply.id}`} />
          <label className="field">
            <span>Available slot</span>
            <select className="select" name="slotId">
              {availableSlots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {formatSlot(slot)}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="submit">
            Book selected slot
          </button>
        </form>
      ) : (
        <p className="muted">No available slots. Add slots in AI Assistant before booking.</p>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  note
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="panel metric">
      <p className="metric-label">
        {icon} {label}
      </p>
      <p className="metric-value">{formatNumber(value)}</p>
      <p className="metric-note">{note}</p>
    </div>
  );
}

function MiniMetric({ label, value, status }: { label: string; value: string; status?: string }) {
  return (
    <div className="metric compact-metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value metric-inline">
        {status ? <StatusBadge label={value} status={status} /> : value}
      </p>
    </div>
  );
}

function confidenceLabel(score: number) {
  if (score >= 80) return `High confidence (${score}%)`;
  if (score >= 55) return `Needs review (${score}%)`;
  return `Do not auto-send (${score}%)`;
}

function salesStageLabel(stage: string | null | undefined) {
  const labels: Record<string, string> = {
    NEW_ENQUIRY: "New enquiry",
    INTERESTED: "Interested",
    QUALIFIED_LEAD: "Qualified lead",
    MEETING_REQUESTED: "Meeting requested",
    MEETING_BOOKED: "Meeting booked",
    NOT_INTERESTED: "Not interested",
    FOLLOW_UP_REQUIRED: "Follow-up required"
  };
  return stage ? (labels[stage] ?? stage) : "Not set";
}

function formatSlot(slot: { startAt: Date; endAt: Date; timezone: string }) {
  return `${new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: slot.timezone
  }).format(slot.startAt)} ${slot.timezone}`;
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function replyLeadName(reply: ReplyDetail) {
  const name = [reply.lead?.firstName, reply.lead?.lastName].filter(Boolean).join(" ");
  return (
    reply.lead?.company ||
    name ||
    reply.fromEmail ||
    reply.fromPhoneE164 ||
    reply.lead?.email ||
    "Unknown lead"
  );
}

function replyContact(reply: ReplyDetail) {
  if (reply.channel === MessageChannel.WHATSAPP) {
    return reply.fromPhoneE164 || reply.lead?.phoneE164 || "WhatsApp number not saved";
  }
  return reply.fromEmail || reply.lead?.email || "Email not saved";
}

function replyPreview(reply: ReplyDetail) {
  const text =
    reply.channel === MessageChannel.WHATSAPP ? reply.bodyText : `${reply.subject} ${reply.bodyText}`;
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 130 ? `${compact.slice(0, 130)}...` : compact || "No message text";
}

function replyActionLabel(reply: ReplyDetail, draft?: ReplyDetail["drafts"][number]) {
  if (reply.ownerActionRequired) return "Needs your review";
  if (reply.status === ReplyStatus.AUTO_REPLIED || draft?.status === AiReplyDraftStatus.SENT)
    return "AI replied";
  if (draft?.status === AiReplyDraftStatus.DRAFT) return "Draft ready";
  if (reply.status === ReplyStatus.HOT_HANDOFF) return "Hot lead";
  if (reply.status === ReplyStatus.CLOSED) return "Closed";
  return "Review";
}
