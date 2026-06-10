import { AiReplyDraftStatus, MeetingSlotStatus, Prisma, ReplyIntent, ReplyStatus } from "@prisma/client";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Flame,
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
  replyStatusLabels
} from "@/lib/status";

export const dynamic = "force-dynamic";

const replyInclude = {
  lead: {
    include: {
      meetingBookings: { include: { slot: true }, orderBy: { createdAt: "desc" }, take: 2 }
    }
  },
  conversation: { include: { messages: { orderBy: { createdAt: "desc" }, take: 8 } } },
  drafts: { orderBy: { createdAt: "desc" }, take: 1 },
  whatsappMessage: true
} satisfies Prisma.InboundReplyInclude;

type ReplyDetailData = Prisma.InboundReplyGetPayload<{ include: typeof replyInclude }>;

type PageProps = {
  searchParams: Promise<{ selected?: string; intent?: string; status?: string }>;
};

export default async function WhatsappInboxPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const where = {
    channel: "WHATSAPP" as const,
    ...(params.intent && params.intent in ReplyIntent ? { intent: params.intent as ReplyIntent } : {}),
    ...(params.status && params.status in ReplyStatus ? { status: params.status as ReplyStatus } : {})
  };

  const [replies, selectedReply, counts, availableSlots] = await Promise.all([
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
    getCounts(),
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
        eyebrow="WhatsApp AI Inbox"
        title="WhatsApp reply queue"
        description="Track every WhatsApp number, saved conversation, AI reply state, and the next action."
        actions={
          <Link className="secondary-button" href="/whatsapp">
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </Link>
        }
      />

      <section className="grid grid-4" aria-label="WhatsApp inbox metrics">
        <Metric label="Captured" value={counts.total} />
        <Metric label="Hot leads" value={counts.hot} />
        <Metric label="Draft ready" value={counts.draftReady} />
        <Metric label="Needs you" value={counts.ownerReview} />
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-body">
          <form className="form-grid" action="/whatsapp/inbox">
            <label className="field">
              <span>Intent</span>
              <select className="select" name="intent" defaultValue={params.intent ?? ""}>
                <option value="">All intents</option>
                {Object.values(ReplyIntent).map((intent) => (
                  <option key={intent} value={intent}>
                    {replyIntentLabels[intent]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select className="select" name="status" defaultValue={params.status ?? ""}>
                <option value="">All statuses</option>
                {Object.values(ReplyStatus).map((status) => (
                  <option key={status} value={status}>
                    {replyStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button" type="submit">
              Apply filters
            </button>
          </form>
        </div>
      </section>

      <div className="split-layout inbox-layout" style={{ marginTop: 16 }}>
        <section className="panel" aria-label="WhatsApp reply list">
          <div className="panel-header">
            <div>
              <h2>Replies</h2>
              <p className="muted">Latest {formatNumber(replies.length)} WhatsApp replies.</p>
            </div>
          </div>
          <div className="panel-body stack">
            {replies.length ? (
              replies.map((reply) => (
                <WhatsappReplyQueueItem
                  key={reply.id}
                  reply={reply}
                  selected={activeReply?.id === reply.id}
                  href={`/whatsapp/inbox?selected=${reply.id}${params.intent ? `&intent=${params.intent}` : ""}${
                    params.status ? `&status=${params.status}` : ""
                  }`}
                />
              ))
            ) : (
              <div className="empty-state">No WhatsApp replies match this view yet.</div>
            )}
          </div>
        </section>

        <ReplyDetail reply={activeReply} availableSlots={availableSlots} />
      </div>
    </>
  );
}

function WhatsappReplyQueueItem({
  reply,
  href,
  selected
}: {
  reply: ReplyDetailData;
  href: string;
  selected: boolean;
}) {
  const draft = reply.drafts[0];
  return (
    <Link
      className={`reply-list-item reply-work-item${selected ? " reply-list-item-active" : ""}`}
      href={href}
      aria-current={selected ? "page" : undefined}
    >
      <span className="reply-channel-icon" aria-hidden="true">
        <MessageCircle size={17} />
      </span>
      <span className="reply-list-main">
        <strong>{replyLeadName(reply)}</strong>
        <span>{replyPreview(reply)}</span>
        <span className="reply-contact-line">
          {reply.fromPhoneE164 || reply.lead?.phoneE164 || "No number saved"}
        </span>
      </span>
      <span className="reply-list-meta">
        <StatusBadge label={replyIntentLabels[reply.intent]} status={reply.intent} />
        <span>{replyActionLabel(reply, draft)}</span>
        <span>{formatDate(reply.receivedAt)}</span>
      </span>
    </Link>
  );
}

async function getCounts() {
  const [total, hot, draftReady, ownerReview] = await Promise.all([
    prisma.inboundReply.count({ where: { channel: "WHATSAPP" } }),
    prisma.inboundReply.count({ where: { channel: "WHATSAPP", status: ReplyStatus.HOT_HANDOFF } }),
    prisma.inboundReply.count({ where: { channel: "WHATSAPP", status: ReplyStatus.DRAFT_READY } }),
    prisma.inboundReply.count({ where: { channel: "WHATSAPP", ownerActionRequired: true } })
  ]);
  return { total, hot, draftReady, ownerReview };
}

function ReplyDetail({
  reply,
  availableSlots
}: {
  reply: ReplyDetailData | null;
  availableSlots: Array<{ id: string; startAt: Date; endAt: Date; timezone: string }>;
}) {
  if (!reply) {
    return (
      <aside className="panel">
        <div className="panel-body empty-state">Select a WhatsApp reply.</div>
      </aside>
    );
  }
  const draft = reply.drafts?.[0];
  const canSendDraft = draft && draft.status === AiReplyDraftStatus.DRAFT;
  const aiPaused = Boolean(reply.lead?.aiAutoReplyPaused || reply.lead?.whatsappBotPaused);
  const nextAction = replyActionLabel(reply, draft);

  return (
    <aside className="panel reply-detail-panel">
      <div className="panel-header reply-detail-header">
        <div className="reply-detail-heading">
          <span className="reply-channel-icon large" aria-hidden="true">
            <MessageCircle size={20} />
          </span>
          <div>
            <h2>{replyLeadName(reply)}</h2>
            <p className="muted">
              {reply.fromPhoneE164 || reply.lead?.phoneE164 || "No WhatsApp number saved"}
            </p>
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
                "Review the latest WhatsApp message and decide whether to let AI continue."}
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
          <MiniMetric label="Intent" value={replyIntentLabels[reply.intent]} status={reply.intent} />
          <MiniMetric
            label="Sales stage"
            value={salesStageLabel(reply.salesStage ?? reply.lead?.salesStage)}
          />
          <MiniMetric
            label="Sentiment"
            value={replySentimentLabels[reply.sentiment]}
            status={reply.sentiment}
          />
          <MiniMetric label="Confidence" value={`${reply.aiConfidence}%`} />
        </div>

        <div className="reply-section">
          <div className="reply-section-header">
            <h3>Latest WhatsApp message</h3>
            <span>{formatDate(reply.receivedAt)}</span>
          </div>
          <pre className="email-preview readable-preview">{reply.bodyText}</pre>
        </div>

        <ConversationTimeline reply={reply} />

        <MeetingBookingPanel reply={reply} availableSlots={availableSlots} />

        <div className="reply-section">
          <div className="reply-section-header">
            <h3>AI draft</h3>
            {draft ? (
              <StatusBadge label={aiReplyDraftStatusLabels[draft.status]} status={draft.status} />
            ) : null}
          </div>
          {draft ? (
            <div className="stack" style={{ marginTop: 8 }}>
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
                  <input type="hidden" name="returnTo" value={`/whatsapp/inbox?selected=${reply.id}`} />
                  <button className="button" type="submit">
                    <Send size={16} aria-hidden="true" /> Send WhatsApp AI draft
                  </button>
                </form>
              ) : null}
            </div>
          ) : (
            <p className="muted">No AI draft exists for this WhatsApp reply.</p>
          )}
        </div>

        <details className="advanced-inline reply-details-more">
          <summary>Lead and AI details</summary>
          <div className="profile-list">
            <ProfileRow
              label="Lead status"
              value={reply.lead ? leadStatusLabels[reply.lead.status] : "Unknown"}
            />
            <ProfileRow label="Phone" value={reply.lead?.phoneE164 || reply.fromPhoneE164 || "Unknown"} />
            <ProfileRow label="Language" value={reply.language === "ar" ? "Arabic" : "English"} />
            <ProfileRow
              label="Missing details"
              value={reply.missingContactFields.length ? reply.missingContactFields.join(", ") : "None"}
            />
            <ProfileRow label="Received" value={formatDate(reply.receivedAt)} />
            <ProfileRow
              label="AI for this lead"
              value={aiPaused ? "You are handling this lead" : "AI can help"}
            />
          </div>
        </details>

        <div className="toolbar" style={{ marginBottom: 0 }}>
          {reply.lead ? (
            aiPaused ? (
              <form action={resumeAiForLeadAction}>
                <input type="hidden" name="leadId" value={reply.lead.id} />
                <input type="hidden" name="replyId" value={reply.id} />
                <input type="hidden" name="returnTo" value={`/whatsapp/inbox?selected=${reply.id}`} />
                <button className="secondary-button" type="submit">
                  Turn AI back on
                </button>
              </form>
            ) : (
              <form action={pauseAiForLeadAction}>
                <input type="hidden" name="leadId" value={reply.lead.id} />
                <input type="hidden" name="replyId" value={reply.id} />
                <input type="hidden" name="returnTo" value={`/whatsapp/inbox?selected=${reply.id}`} />
                <button className="secondary-button" type="submit">
                  AI off for this lead
                </button>
              </form>
            )
          ) : null}
          <form action={markInboundReplyHot}>
            <input type="hidden" name="replyId" value={reply.id} />
            <button className="secondary-button" type="submit">
              <Flame size={16} aria-hidden="true" /> Handoff to me
            </button>
          </form>
          <form action={reprocessInboundReply}>
            <input type="hidden" name="replyId" value={reply.id} />
            <button className="secondary-button" type="submit">
              <RotateCcw size={16} aria-hidden="true" /> Re-run AI
            </button>
          </form>
          <form action={closeInboundReply}>
            <input type="hidden" name="replyId" value={reply.id} />
            <button className="secondary-button" type="submit">
              <UserCheck size={16} aria-hidden="true" /> Close
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function ConversationTimeline({ reply }: { reply: ReplyDetailData }) {
  const messages = reply.conversation?.messages.slice().reverse() ?? [];
  return (
    <div className="reply-section">
      <div className="reply-section-header">
        <h3>Saved WhatsApp history</h3>
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
          <p className="muted">No saved phone-number history yet.</p>
        )}
      </div>
    </div>
  );
}

function MeetingBookingPanel({
  reply,
  availableSlots
}: {
  reply: ReplyDetailData;
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
          <input type="hidden" name="returnTo" value={`/whatsapp/inbox?selected=${reply.id}`} />
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{formatNumber(value)}</p>
      <p className="metric-note">WhatsApp only</p>
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

function replyLeadName(reply: ReplyDetailData) {
  const name = [reply.lead?.firstName, reply.lead?.lastName].filter(Boolean).join(" ");
  return reply.lead?.company || name || reply.fromPhoneE164 || reply.lead?.phoneE164 || "WhatsApp lead";
}

function replyPreview(reply: ReplyDetailData) {
  const compact = reply.bodyText.replace(/\s+/g, " ").trim();
  return compact.length > 130 ? `${compact.slice(0, 130)}...` : compact || "No message text";
}

function replyActionLabel(reply: ReplyDetailData, draft?: ReplyDetailData["drafts"][number]) {
  if (reply.ownerActionRequired) return "Needs your review";
  if (reply.status === ReplyStatus.AUTO_REPLIED || draft?.status === AiReplyDraftStatus.SENT)
    return "AI replied";
  if (draft?.status === AiReplyDraftStatus.DRAFT) return "Draft ready";
  if (reply.status === ReplyStatus.HOT_HANDOFF) return "Hot lead";
  if (reply.status === ReplyStatus.CLOSED) return "Closed";
  return "Review";
}
