import { CampaignObjective, LeadStatus } from "@prisma/client";
import { ArrowLeft, WandSparkles } from "lucide-react";
import Link from "next/link";
import { createCampaign } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { objectiveLabels } from "@/lib/campaigns";
import { formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { leadStatusLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const [offers, leadCounts] = await Promise.all([
    prisma.offer.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.lead.groupBy({ by: ["status"], _count: { status: true } })
  ]);

  const countsByStatus = new Map(leadCounts.map((item) => [item.status, item._count.status]));
  const contactableCount = Object.values(LeadStatus)
    .filter((status) => !["SUPPRESSED", "UNSUBSCRIBED", "BOUNCED", "DO_NOT_CONTACT"].includes(status))
    .reduce((sum, status) => sum + (countsByStatus.get(status) ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Campaign Builder"
        title="Create AI campaign draft"
        description="Choose what Virtuprose is selling, select a conservative audience, and generate an editable sequence. Nothing sends from Phase 2."
        actions={
          <Link className="secondary-button" href="/campaigns">
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </Link>
        }
      />

      <div className="builder-layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Campaign setup</h2>
              <p className="muted">The draft will attach eligible leads and immediately run safety checks.</p>
            </div>
          </div>
          <div className="panel-body">
            {offers.length ? (
              <form action={createCampaign} className="stack">
                <label className="field">
                  <span>Campaign name</span>
                  <input
                    className="input"
                    name="name"
                    required
                    minLength={3}
                    placeholder="May outreach - website review"
                  />
                  <small>Use a name that tells you the offer, audience, or source.</small>
                </label>

                <div className="form-grid">
                  <label className="field">
                    <span>Virtuprose offer</span>
                    <select className="select" name="offerId" required>
                      {offers.map((offer) => (
                        <option key={offer.id} value={offer.id}>
                          {offer.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Objective</span>
                    <select className="select" name="objective" defaultValue={CampaignObjective.AUDIT_OFFER}>
                      {Object.values(CampaignObjective).map((objective) => (
                        <option key={objective} value={objective}>
                          {objectiveLabels[objective]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Audience status</span>
                    <select className="select" name="status" defaultValue={LeadStatus.VALIDATED}>
                      <option value="ALL">All contactable statuses ({formatNumber(contactableCount)})</option>
                      {Object.values(LeadStatus).map((status) => (
                        <option key={status} value={status}>
                          {leadStatusLabels[status]} ({formatNumber(countsByStatus.get(status) ?? 0)})
                        </option>
                      ))}
                    </select>
                    <small>
                      Suppressed, bounced, unsubscribed, and do-not-contact leads are always excluded.
                    </small>
                  </label>

                  <label className="field">
                    <span>Maximum recipients</span>
                    <input
                      className="input"
                      name="maxRecipients"
                      type="number"
                      min={1}
                      max={5000}
                      defaultValue={100}
                    />
                    <small>Start small until Phase 3 sending health and ramp controls exist.</small>
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Tag filter</span>
                    <input className="input" name="tag" placeholder="hot, ecommerce, founder" />
                  </label>
                  <label className="field">
                    <span>Country filter</span>
                    <input className="input" name="country" placeholder="United States, Kuwait, UAE" />
                  </label>
                </div>

                <div className="alert">
                  Approval is separate from sending. Phase 2 stores the draft and review result only; Phase 3
                  adds throttled sending.
                </div>

                <button className="button" type="submit">
                  <WandSparkles size={16} aria-hidden="true" /> Generate draft
                </button>
              </form>
            ) : (
              <div className="empty-state">
                Create or activate at least one offer before generating a campaign draft.
              </div>
            )}
          </div>
        </section>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2>Approval gates</h2>
              <p className="muted">A campaign cannot be approved with blockers.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <Gate label="Audience has eligible leads" />
            <Gate label="No suppressed recipients attached" />
            <Gate label="Lead source, country, and legal basis are present" />
            <Gate label="Unsubscribe placeholder stays in every email" />
            <Gate label="Sender identity is configured in Settings" />
            <Gate label="No disallowed offer claims are used" />
          </div>
        </aside>
      </div>
    </>
  );
}

function Gate({ label }: { label: string }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <StatusBadge label="Checked" status="DRAFT" />
    </div>
  );
}
