import { AiReplyDraftStatus, Prisma, ReplyIntent, ReplyStatus, SendingAccountStatus } from "@prisma/client";
import { Bot, Flame, Inbox, RotateCcw, Send, Sparkles, UserCheck } from "lucide-react";
import Link from "next/link";
import {
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
  lead: true,
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

  const [replies, selectedReply, counts, sendingAccounts] = await Promise.all([
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
    })
  ]);

  const activeReply = selectedReply ?? replies[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Replies"
        title="Replies"
        description="AI reads replies, drafts safe responses, and shows you who needs attention."
        actions={
          <Link className="secondary-button" href="/pipeline">
            <UserCheck size={16} aria-hidden="true" /> View Hot Leads
          </Link>
        }
      />

      <section className="grid grid-4" aria-label="Inbox metrics">
        <Metric icon={<Inbox size={18} />} label="Replies" value={counts.total} note="All captured replies" />
        <Metric icon={<Flame size={18} />} label="Hot leads" value={counts.hot} note="Ready for you" />
        <Metric
          icon={<Sparkles size={18} />}
          label="Ready replies"
          value={counts.draftReady}
          note="AI prepared responses"
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
                <Link
                  key={reply.id}
                  className="reply-list-item"
                  href={`/inbox?selected=${reply.id}${params.intent ? `&intent=${params.intent}` : ""}${
                    params.status ? `&status=${params.status}` : ""
                  }`}
                >
                  <span className="reply-list-main">
                    <strong>
                      {reply.lead?.company || reply.lead?.email || reply.fromEmail || reply.fromPhoneE164}
                    </strong>
                    <span>{reply.subject}</span>
                  </span>
                  <span className="reply-list-meta">
                    <StatusBadge label={replyIntentLabels[reply.intent]} status={reply.intent} />
                    <span>{formatDate(reply.receivedAt)}</span>
                  </span>
                </Link>
              ))
            ) : (
              <div className="empty-state">No replies match this view yet.</div>
            )}
          </div>
        </section>

        <ReplyDetailPanel reply={activeReply} sendingAccounts={sendingAccounts} />
      </div>
    </>
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
  sendingAccounts
}: {
  reply: ReplyDetail | null;
  sendingAccounts: Array<{ id: string; name: string; dryRun: boolean; status: SendingAccountStatus }>;
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

  return (
    <aside className="panel">
      <div className="panel-header">
        <div>
          <h2>{reply.lead?.company || reply.fromEmail || reply.fromPhoneE164}</h2>
          <p className="muted">{reply.fromEmail || reply.fromPhoneE164}</p>
        </div>
        <StatusBadge label={replyStatusLabels[reply.status]} status={reply.status} />
      </div>
      <div className="panel-body stack">
        <div className="grid grid-3">
          <MiniMetric label="What they want" value={replyIntentLabels[reply.intent]} status={reply.intent} />
          <MiniMetric label="Tone" value={replySentimentLabels[reply.sentiment]} status={reply.sentiment} />
          <MiniMetric label="AI confidence" value={confidenceLabel(reply.aiConfidence)} />
        </div>

        <div className="profile-list">
          <ProfileRow
            label="Contact status"
            value={reply.lead ? leadStatusLabels[reply.lead.status] : "Unknown"}
          />
          <ProfileRow label="Campaign" value={reply.campaign?.name || "Not matched"} />
          <ProfileRow label="Service" value={reply.campaign?.offer.name || "Not matched"} />
          <ProfileRow label="Received" value={formatDate(reply.receivedAt)} />
          <ProfileRow
            label="AI for this lead"
            value={aiPaused ? "You are handling this lead" : "AI can help"}
          />
        </div>

        {reply.aiSummary ? (
          <div className="alert success-alert">
            <strong>AI summary</strong>
            <br />
            {reply.aiSummary}
          </div>
        ) : null}

        {reply.aiSuggestedAction ? (
          <div className="alert">
            <strong>Suggested next action</strong>
            <br />
            {reply.aiSuggestedAction}
          </div>
        ) : null}

        <div>
          <h3>What they said</h3>
          <pre className="email-preview">{reply.bodyText}</pre>
        </div>

        <div>
          <h3>Suggested reply</h3>
          {draft ? (
            <div className="stack" style={{ marginTop: 8 }}>
              <div className="profile-row">
                <span>Reply status</span>
                <span>
                  <StatusBadge label={aiReplyDraftStatusLabels[draft.status]} status={draft.status} />
                </span>
              </div>
              <div className="profile-row">
                <span>Subject</span>
                <span>{draft.subject}</span>
              </div>
              <pre className="email-preview">{draft.bodyText}</pre>
              {draft.riskFlags.length ? (
                <div className="tag-list">
                  {draft.riskFlags.map((flag) => (
                    <span className="tag" key={flag}>
                      {flag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="muted">No AI draft exists for this reply.</p>
          )}
        </div>

        <div className="stack">
          {canSendDraft ? (
            <form action={sendAiReplyDraftAction} className="stack">
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

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
