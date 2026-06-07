import { LeadStatus, WhatsappTemplateStatus } from "@prisma/client";
import { ArrowLeft, WandSparkles } from "lucide-react";
import Link from "next/link";
import { createWhatsappCampaign } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { leadStatusLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ templateId?: string }>;
};

const variableOptions = [
  ["firstName", "First name"],
  ["fullName", "Full name"],
  ["company", "Company"],
  ["website", "Website"],
  ["role", "Role"],
  ["country", "Country"],
  ["offerName", "Offer name"],
  ["valueProposition", "Value proposition"],
  ["senderName", "Sender name"]
];

export default async function NewWhatsappCampaignPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [defaultOffer, templates, leadCounts, eligibleCount] = await Promise.all([
    prisma.offer.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    prisma.whatsappTemplate.findMany({
      where: { active: true, status: WhatsappTemplateStatus.APPROVED },
      orderBy: { name: "asc" }
    }),
    prisma.lead.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.lead.count({
      where: {
        phoneE164: { not: null },
        whatsappOptIn: true,
        whatsappStatus: "OPTED_IN",
        whatsappStoppedAt: null
      }
    })
  ]);
  const selectedTemplate =
    templates.find((template) => template.id === params.templateId) ?? templates[0] ?? null;
  const countsByStatus = new Map(leadCounts.map((item) => [item.status, item._count.status]));

  return (
    <>
      <PageHeader
        eyebrow="Campaigns"
        title="Create WhatsApp campaign"
        description="Choose an approved WhatsApp message, select who should receive it, and review safety before sending."
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
              <p className="muted">You approve the audience and message before the assistant starts.</p>
            </div>
          </div>
          <div className="panel-body">
            {defaultOffer && selectedTemplate ? (
              <form action={createWhatsappCampaign} className="stack">
                <input type="hidden" name="offerId" value={defaultOffer.id} />
                <div className="choice-grid" aria-label="Choose campaign type">
                  <Link className="choice-card" href="/campaigns/new">
                    <strong>Email</strong>
                    <span>Use AI to create an email sequence.</span>
                  </Link>
                  <div className="choice-card choice-card-active">
                    <strong>WhatsApp</strong>
                    <span>Send an approved WhatsApp message template.</span>
                  </div>
                </div>

                <label className="field">
                  <span>Campaign name</span>
                  <input className="input" name="name" required placeholder="WhatsApp website audit - June" />
                </label>

                <div className="form-grid">
                  <label className="field">
                    <span>WhatsApp message</span>
                    <select className="select" name="templateId" defaultValue={selectedTemplate.id} required>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                    <small>
                      The personal words below come from {selectedTemplate.name}. Reopen this page after
                      changing the message.
                    </small>
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Who should receive it?</span>
                    <select className="select" name="status" defaultValue={LeadStatus.VALIDATED}>
                      <option value="ALL">All eligible WhatsApp leads ({formatNumber(eligibleCount)})</option>
                      {Object.values(LeadStatus).map((status) => (
                        <option key={status} value={status}>
                          {leadStatusLabels[status]} ({formatNumber(countsByStatus.get(status) ?? 0)})
                        </option>
                      ))}
                    </select>
                    <small>Full phone number and WhatsApp permission are always required.</small>
                  </label>
                  <label className="field">
                    <span>How many people?</span>
                    <input
                      className="input"
                      name="maxRecipients"
                      type="number"
                      min={1}
                      max={5000}
                      defaultValue={25}
                    />
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Only leads with tag</span>
                    <input className="input" name="tag" placeholder="client, warm, ecommerce" />
                  </label>
                  <label className="field">
                    <span>Only leads in country</span>
                    <input className="input" name="country" placeholder="Kuwait, UAE, United States" />
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Daily sending limit</span>
                    <input
                      className="input"
                      name="dailyCap"
                      type="number"
                      min={1}
                      max={500}
                      defaultValue={25}
                    />
                  </label>
                  <label className="field">
                    <span>Start time</span>
                    <input className="input" name="sendWindowStart" type="time" defaultValue="09:00" />
                    <small>The assistant starts sending only after this time.</small>
                  </label>
                  <label className="field">
                    <span>End time</span>
                    <input className="input" name="sendWindowEnd" type="time" defaultValue="17:00" />
                    <small>The assistant stops starting new sends after this time.</small>
                  </label>
                </div>

                <div className="panel-subsection">
                  <h3>Personal words</h3>
                  <p className="muted">Tell the assistant what to place inside each blank.</p>
                  {selectedTemplate.variables.length ? (
                    <div className="form-grid" style={{ marginTop: 10 }}>
                      {selectedTemplate.variables.map((variable) => (
                        <label className="field" key={variable}>
                          <span>Personal word {variable}</span>
                          <select className="select" name={`var:${variable}`} defaultValue="firstName">
                            {variableOptions.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">This template has no variables.</div>
                  )}
                </div>

                <label className="field checkbox-field">
                  <input name="ownerApproval" type="checkbox" required />
                  <span>I confirm these people gave WhatsApp permission and this message is approved.</span>
                  <small>Required before the assistant creates the campaign.</small>
                </label>

                <button className="button" type="submit">
                  <WandSparkles size={16} aria-hidden="true" /> Create WhatsApp campaign
                </button>
              </form>
            ) : (
              <div className="empty-state">Add one approved WhatsApp message before creating campaigns.</div>
            )}
          </div>
        </section>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2>Before sending, we checked:</h2>
              <p className="muted">These checks are enforced again before sending starts.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <Gate label="The message is approved by WhatsApp" />
            <Gate label="People without full phone numbers are skipped" />
            <Gate label="Only people allowed on WhatsApp are included" />
            <Gate label="People who asked to stop are skipped" />
            <Gate label="The first message uses an approved template" />
            <Gate label="AI only replies after the person messages back" />
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
      <StatusBadge label="Required" status="DRAFT" />
    </div>
  );
}
