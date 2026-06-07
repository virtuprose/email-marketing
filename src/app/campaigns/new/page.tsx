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
        eyebrow="Campaigns"
        title="Create email campaign"
        description="Choose the service, select a safe audience, and let AI prepare an email campaign for your review."
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
              <p className="muted">The assistant will only include people who are safe to contact.</p>
            </div>
          </div>
          <div className="panel-body">
            {offers.length ? (
              <form action={createCampaign} className="stack">
                <div className="choice-grid" aria-label="Choose campaign type">
                  <div className="choice-card choice-card-active">
                    <strong>Email</strong>
                    <span>Use AI to create an email sequence.</span>
                  </div>
                  <Link className="choice-card" href="/whatsapp/campaigns/new">
                    <strong>WhatsApp</strong>
                    <span>Send an approved WhatsApp message template.</span>
                  </Link>
                </div>

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
                    <span>Service to promote</span>
                    <select className="select" name="offerId" required>
                      {offers.map((offer) => (
                        <option key={offer.id} value={offer.id}>
                          {offer.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Goal</span>
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
                    <span>Who should receive it?</span>
                    <select className="select" name="status" defaultValue={LeadStatus.VALIDATED}>
                      <option value="ALL">All contactable statuses ({formatNumber(contactableCount)})</option>
                      {Object.values(LeadStatus).map((status) => (
                        <option key={status} value={status}>
                          {leadStatusLabels[status]} ({formatNumber(countsByStatus.get(status) ?? 0)})
                        </option>
                      ))}
                    </select>
                    <small>
                      People who bounced, opted out, or are marked do not contact are always skipped.
                    </small>
                  </label>

                  <label className="field">
                    <span>How many people?</span>
                    <input
                      className="input"
                      name="maxRecipients"
                      type="number"
                      min={1}
                      max={5000}
                      defaultValue={100}
                    />
                    <small>Start small until you confirm replies and delivery look good.</small>
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Only leads with tag</span>
                    <input className="input" name="tag" placeholder="hot, ecommerce, founder" />
                  </label>
                  <label className="field">
                    <span>Only leads in country</span>
                    <input className="input" name="country" placeholder="United States, Kuwait, UAE" />
                  </label>
                </div>

                <div className="alert">
                  You will review the message and approve it before anything is sent.
                </div>

                <button className="button" type="submit">
                  <WandSparkles size={16} aria-hidden="true" /> Create email draft
                </button>
              </form>
            ) : (
              <div className="empty-state">Add at least one service before creating a campaign.</div>
            )}
          </div>
        </section>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2>Before sending, we checked:</h2>
              <p className="muted">These checks stay visible so you know what will happen.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <Gate label="There are people ready to contact" />
            <Gate label="People who opted out are removed" />
            <Gate label="Missing contact details are skipped" />
            <Gate label="Every email includes an unsubscribe link" />
            <Gate label="Your sender details are saved" />
            <Gate label="The message avoids risky claims" />
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
