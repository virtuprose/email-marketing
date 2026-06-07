import { WhatsappTemplateCategory, WhatsappTemplateStatus } from "@prisma/client";
import { ArrowLeft, RefreshCcw, Save, Send, UploadCloud } from "lucide-react";
import Link from "next/link";
import {
  saveWhatsappTemplate,
  sendWhatsappTemplateTest,
  submitWhatsappTemplateToMeta,
  syncWhatsappTemplateFromMeta
} from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { whatsappTemplateCategoryLabels, whatsappTemplateStatusLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

type WhatsappTemplatesPageProps = {
  searchParams: Promise<{
    testError?: string;
    testOk?: string;
  }>;
};

export default async function WhatsappTemplatesPage({ searchParams }: WhatsappTemplatesPageProps) {
  const params = await searchParams;
  const templates = await prisma.whatsappTemplate.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return (
    <>
      <PageHeader
        eyebrow="Campaigns"
        title="WhatsApp Message Templates"
        description="Create reusable WhatsApp messages, send them for approval, and test them before using them in campaigns."
        actions={
          <Link className="secondary-button" href="/campaigns">
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </Link>
        }
      />

      {params.testError ? (
        <div className="danger-alert alert" role="alert" style={{ marginBottom: 16 }}>
          {params.testError}
        </div>
      ) : null}

      {params.testOk ? (
        <div className="success-alert alert" role="status" style={{ marginBottom: 16 }}>
          {params.testOk}
        </div>
      ) : null}

      <div className="grid grid-2">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Add WhatsApp message</h2>
              <p className="muted">WhatsApp must approve business-first messages before you can send them.</p>
            </div>
          </div>
          <div className="panel-body">
            <form action={saveWhatsappTemplate} className="stack">
              <label className="field">
                <span>Template name</span>
                <input className="input" name="name" required placeholder="Website audit intro" />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Template name in WhatsApp</span>
                  <input
                    className="input"
                    name="metaTemplateName"
                    required
                    placeholder="website_audit_intro"
                    pattern="[a-z0-9_]+"
                  />
                  <small>Use lowercase letters, numbers, and underscores only.</small>
                </label>
                <label className="field">
                  <span>Language</span>
                  <input className="input" name="language" defaultValue="en" required />
                </label>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Category</span>
                  <select
                    className="select"
                    name="category"
                    defaultValue={WhatsappTemplateCategory.MARKETING}
                  >
                    {Object.values(WhatsappTemplateCategory).map((category) => (
                      <option key={category} value={category}>
                        {whatsappTemplateCategoryLabels[category]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Status</span>
                  <select className="select" name="status" defaultValue={WhatsappTemplateStatus.APPROVED}>
                    {Object.values(WhatsappTemplateStatus).map((status) => (
                      <option key={status} value={status}>
                        {whatsappTemplateStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Personal words</span>
                <textarea className="textarea" name="variables" placeholder={"1\n2\ncompany"} />
                <small>One per line. These are the words the assistant fills in, like name or company.</small>
              </label>
              <label className="field">
                <span>Message text</span>
                <textarea
                  className="textarea"
                  name="bodyPreview"
                  placeholder="Hi {{1}}, quick question about {{2}}..."
                />
                <small>This is what WhatsApp reviews before the message can be used.</small>
              </label>
              <label className="field checkbox-field">
                <input name="active" type="checkbox" defaultChecked />
                <span>Active</span>
                <small>Inactive templates cannot be used for new campaigns.</small>
              </label>
              <button className="button" type="submit">
                <Save size={16} aria-hidden="true" /> Save message
              </button>
            </form>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Saved messages</h2>
              <p className="muted">Use messages marked “Ready to use” for live campaigns.</p>
            </div>
          </div>
          <div className="panel-body stack">
            {templates.length ? (
              templates.map((template) => (
                <details className="faq-item" key={template.id}>
                  <summary>
                    <span>
                      <strong>{template.name}</strong>
                      <br />
                      <span className="muted">{template.metaTemplateName}</span>
                    </span>
                    <StatusBadge
                      label={whatsappTemplateStatusLabels[template.status]}
                      status={template.status}
                    />
                  </summary>
                  <div className="faq-content stack">
                    <div className="profile-list">
                      <ProfileRow
                        label="Category"
                        value={whatsappTemplateCategoryLabels[template.category]}
                      />
                      <ProfileRow label="Language" value={template.language} />
                      <ProfileRow label="Personal words" value={template.variables.join(", ") || "None"} />
                      <ProfileRow label="Created" value={formatDate(template.createdAt)} />
                    </div>
                    <details className="advanced-inline">
                      <summary>Advanced details</summary>
                      <div className="profile-list" style={{ marginTop: 10 }}>
                        <ProfileRow
                          label="WhatsApp template ID"
                          value={template.metaTemplateId || "Not synced"}
                        />
                        <ProfileRow label="Template name in WhatsApp" value={template.metaTemplateName} />
                      </div>
                    </details>
                    {template.bodyPreview ? (
                      <pre className="email-preview">{template.bodyPreview}</pre>
                    ) : null}
                    <div className="toolbar" style={{ marginBottom: 0 }}>
                      <form action={submitWhatsappTemplateToMeta}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <button className="secondary-button" type="submit">
                          <UploadCloud size={16} aria-hidden="true" /> Send for WhatsApp approval
                        </button>
                      </form>
                      <form action={syncWhatsappTemplateFromMeta}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <button className="secondary-button" type="submit">
                          <RefreshCcw size={16} aria-hidden="true" /> Check approval
                        </button>
                      </form>
                    </div>
                    <form action={sendWhatsappTemplateTest} className="stack">
                      <input type="hidden" name="templateId" value={template.id} />
                      <label className="field">
                        <span>Send test to</span>
                        <input
                          className="input"
                          name="toPhoneE164"
                          type="tel"
                          inputMode="tel"
                          pattern="^\+[1-9][0-9]{7,14}$"
                          placeholder="+96560000000"
                          required
                        />
                        <small>Add the full phone number with country code.</small>
                      </label>
                      {template.variables.map((variable) => (
                        <label className="field" key={variable}>
                          <span>Test word for {variable}</span>
                          <input className="input" name={`testVar:${variable}`} placeholder="Test value" />
                        </label>
                      ))}
                      <button className="secondary-button" type="submit">
                        <Send size={16} aria-hidden="true" /> Send test to me
                      </button>
                    </form>
                  </div>
                </details>
              ))
            ) : (
              <div className="empty-state">Add your first WhatsApp message template.</div>
            )}
          </div>
        </section>
      </div>
    </>
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
