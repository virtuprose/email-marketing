import { DealStage, DealStatus, Prisma } from "@prisma/client";
import { ArrowRight, Flame, MailCheck, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { pauseAiForLeadAction, resumeAiForLeadAction, updatePipelineDealStage } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { dealStageLabels, dealStatusLabels, leadStatusLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

const dealInclude = {
  lead: true,
  campaign: true,
  offer: true
} satisfies Prisma.DealInclude;

type DealWithRelations = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

const boardColumns: Array<{ title: string; stages: DealStage[] }> = [
  {
    title: "Ready to contact",
    stages: [DealStage.REPLIED, DealStage.ENGAGED, DealStage.HOT, DealStage.OWNER_HANDLING]
  },
  {
    title: "Proposal / pricing",
    stages: [DealStage.PROPOSAL_SENT]
  },
  {
    title: "Follow up later",
    stages: [DealStage.FOLLOW_UP_LATER]
  }
];

export default async function PipelinePage() {
  const [deals, hotDeals, openCount, wonCount] = await Promise.all([
    prisma.deal.findMany({
      include: dealInclude,
      orderBy: [{ priorityScore: "desc" }, { updatedAt: "desc" }],
      take: 100
    }),
    prisma.deal.count({ where: { stage: DealStage.HOT, status: DealStatus.OPEN } }),
    prisma.deal.count({ where: { status: DealStatus.OPEN } }),
    prisma.deal.count({ where: { status: DealStatus.WON } })
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Hot Leads"
        title="Hot Leads"
        description="Only the conversations worth your personal attention."
        actions={
          <Link className="button" href="/inbox">
            Review Replies <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />

      <section className="grid grid-4" aria-label="Pipeline metrics">
        <Metric
          icon={<Target size={18} />}
          label="Active hot leads"
          value={openCount}
          note="Active opportunities"
        />
        <Metric icon={<Flame size={18} />} label="Ready now" value={hotDeals} note="Needs your attention" />
        <Metric
          icon={<MailCheck size={18} />}
          label="All opportunities"
          value={deals.length}
          note="Created from replies"
        />
        <Metric icon={<Trophy size={18} />} label="Closed wins" value={wonCount} note="Marked as won" />
      </section>

      <section
        className="pipeline-board pipeline-board-simple"
        aria-label="Hot lead board"
        style={{ marginTop: 16 }}
      >
        {boardColumns.map((column) => (
          <PipelineColumn
            key={column.title}
            title={column.title}
            deals={deals.filter(
              (deal) => column.stages.includes(deal.stage) && deal.status === DealStatus.OPEN
            )}
          />
        ))}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div>
            <h2>Closed and paused</h2>
            <p className="muted">A simple record of leads you already handled.</p>
          </div>
        </div>
        <div className="table-wrap embedded-table" aria-label="Closed deals">
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Score</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {deals.filter((deal) => deal.status !== DealStatus.OPEN).length ? (
                deals
                  .filter((deal) => deal.status !== DealStatus.OPEN)
                  .map((deal) => (
                    <tr key={deal.id}>
                      <td>
                        {deal.lead.company || deal.lead.email}
                        <br />
                        <span className="muted">{deal.lead.email}</span>
                      </td>
                      <td>
                        <StatusBadge label={dealStageLabels[deal.stage]} status={deal.stage} />
                      </td>
                      <td>
                        <StatusBadge label={dealStatusLabels[deal.status]} status={deal.status} />
                      </td>
                      <td>{deal.priorityScore}</td>
                      <td>{formatDate(deal.updatedAt)}</td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">No closed or paused deals yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PipelineColumn({ title, deals }: { title: string; deals: DealWithRelations[] }) {
  return (
    <section className="pipeline-column">
      <div className="pipeline-column-header">
        <h2>{title}</h2>
        <span>{formatNumber(deals.length)}</span>
      </div>
      <div className="stack">
        {deals.length ? (
          deals.map((deal) => <DealCard key={deal.id} deal={deal} />)
        ) : (
          <div className="empty-state compact-empty">No hot leads here yet.</div>
        )}
      </div>
    </section>
  );
}

function DealCard({ deal }: { deal: DealWithRelations }) {
  return (
    <article className="deal-card">
      <div className="deal-card-head">
        <div>
          <h3>{deal.lead.company || deal.lead.email}</h3>
          <p className="muted">{deal.offer?.name || deal.campaign?.name || "Virtuprose opportunity"}</p>
        </div>
        <StatusBadge label={leadStatusLabels[deal.lead.status]} status={deal.lead.status} />
      </div>

      <div className="profile-list">
        <ProfileRow label="Lead strength" value={`${deal.priorityScore}/100`} />
        <ProfileRow label="Where this lead stands" value={dealStatusLabels[deal.status]} />
        <ProfileRow label="Recommended next step" value={deal.nextAction || "Review manually"} />
        <ProfileRow
          label="AI for this lead"
          value={deal.lead.aiAutoReplyPaused ? "You are handling this lead" : "AI can help"}
        />
        <ProfileRow label="Updated" value={formatDate(deal.updatedAt)} />
      </div>

      {deal.lead.aiAutoReplyPaused ? (
        <form action={resumeAiForLeadAction}>
          <input type="hidden" name="leadId" value={deal.lead.id} />
          <input type="hidden" name="returnTo" value="/pipeline" />
          <button className="secondary-button" type="submit">
            Turn AI back on
          </button>
        </form>
      ) : (
        <form action={pauseAiForLeadAction}>
          <input type="hidden" name="leadId" value={deal.lead.id} />
          <input type="hidden" name="returnTo" value="/pipeline" />
          <button className="secondary-button" type="submit">
            AI off for this lead
          </button>
        </form>
      )}

      <form action={updatePipelineDealStage} className="stack">
        <input type="hidden" name="dealId" value={deal.id} />
        <label className="field">
          <span>Move to</span>
          <select className="select" name="stage" defaultValue={deal.stage}>
            {Object.values(DealStage).map((stage) => (
              <option key={stage} value={stage}>
                {dealStageLabels[stage]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>My notes</span>
          <textarea className="textarea compact-textarea" name="notes" defaultValue={deal.ownerNotes ?? ""} />
        </label>
        <button className="secondary-button" type="submit">
          Save lead
        </button>
      </form>
    </article>
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

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
