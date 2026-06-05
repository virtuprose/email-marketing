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
  const [offers, templates, leadCounts, eligibleCount] = await Promise.all([
    prisma.offer.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
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
        eyebrow="WhatsApp Campaign Builder"
        title="Create template campaign"
        description="Select an approved template, map variables to lead fields, and attach only opted-in WhatsApp leads."
        actions={
          <Link className="secondary-button" href="/whatsapp/campaigns">
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </Link>
        }
      />

      <div className="builder-layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Campaign setup</h2>
              <p className="muted">Owner approval is required before the campaign can be created.</p>
            </div>
          </div>
          <div className="panel-body">
            {offers.length && selectedTemplate ? (
              <form action={createWhatsappCampaign} className="stack">
                <label className="field">
                  <span>Campaign name</span>
                  <input className="input" name="name" required placeholder="WhatsApp website audit - June" />
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
                    <span>Approved template</span>
                    <select className="select" name="templateId" defaultValue={selectedTemplate.id} required>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                    <small>
                      Variable fields below are shown for {selectedTemplate.name}. Refresh with the template
                      link if changing templates.
                    </small>
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Audience status</span>
                    <select className="select" name="status" defaultValue={LeadStatus.VALIDATED}>
                      <option value="ALL">All eligible WhatsApp leads ({formatNumber(eligibleCount)})</option>
                      {Object.values(LeadStatus).map((status) => (
                        <option key={status} value={status}>
                          {leadStatusLabels[status]} ({formatNumber(countsByStatus.get(status) ?? 0)})
                        </option>
                      ))}
                    </select>
                    <small>Phone, opt-in, and WhatsApp status are always required.</small>
                  </label>
                  <label className="field">
                    <span>Maximum recipients</span>
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
                    <span>Tag filter</span>
                    <input className="input" name="tag" placeholder="client, warm, ecommerce" />
                  </label>
                  <label className="field">
                    <span>Country filter</span>
                    <input className="input" name="country" placeholder="Kuwait, UAE, United States" />
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Daily cap</span>
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
                    <span>Send window start</span>
                    <input className="input" name="sendWindowStart" type="time" defaultValue="09:00" />
                  </label>
                  <label className="field">
                    <span>Send window end</span>
                    <input className="input" name="sendWindowEnd" type="time" defaultValue="17:00" />
                  </label>
                </div>

                <div className="panel-subsection">
                  <h3>Variable mapping</h3>
                  <p className="muted">Map each Meta template variable to a known lead or offer field.</p>
                  {selectedTemplate.variables.length ? (
                    <div className="form-grid" style={{ marginTop: 10 }}>
                      {selectedTemplate.variables.map((variable) => (
                        <label className="field" key={variable}>
                          <span>Variable {variable}</span>
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
                  <span>I confirm this WhatsApp audience is opted in and approved for this template.</span>
                  <small>Required before the platform creates campaign recipients.</small>
                </label>

                <button className="button" type="submit">
                  <WandSparkles size={16} aria-hidden="true" /> Create WhatsApp campaign
                </button>
              </form>
            ) : (
              <div className="empty-state">
                Add at least one active offer and one approved WhatsApp template before creating campaigns.
              </div>
            )}
          </div>
        </section>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2>Approval gates</h2>
              <p className="muted">These are enforced again when scheduling.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <Gate label="Template is approved in Meta" />
            <Gate label="Every recipient has E.164 phone" />
            <Gate label="WhatsApp opt-in is recorded" />
            <Gate label="Stopped leads are excluded" />
            <Gate label="Only template sends start outreach" />
            <Gate label="AI replies stay inside the 24-hour window" />
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
