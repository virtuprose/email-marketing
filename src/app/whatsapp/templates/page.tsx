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
        eyebrow="WhatsApp Templates"
        title="Meta Cloud API templates"
        description="Create local template records, submit text-body templates to Meta, sync approval, and test the exact campaign payload."
        actions={
          <Link className="secondary-button" href="/whatsapp">
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
              <h2>Add template</h2>
              <p className="muted">
                Use Meta&apos;s lowercase template name. Submit from here or sync after approval.
              </p>
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
                  <span>Meta template name</span>
                  <input
                    className="input"
                    name="metaTemplateName"
                    required
                    placeholder="website_audit_intro"
                    pattern="[a-z0-9_]+"
                  />
                  <small>Lowercase letters, numbers, and underscores only.</small>
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
                <span>Variables</span>
                <textarea className="textarea" name="variables" placeholder={"1\n2\ncompany"} />
                <small>One variable per line. Meta body variables normally use 1, 2, 3.</small>
              </label>
              <label className="field">
                <span>Preview text</span>
                <textarea
                  className="textarea"
                  name="bodyPreview"
                  placeholder="Hi {{1}}, quick question about {{2}}..."
                />
                <small>This text is submitted to Meta for text-body template approval.</small>
              </label>
              <label className="field checkbox-field">
                <input name="active" type="checkbox" defaultChecked />
                <span>Active</span>
                <small>Inactive templates cannot be used for new campaigns.</small>
              </label>
              <button className="button" type="submit">
                <Save size={16} aria-hidden="true" /> Save template
              </button>
            </form>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Templates</h2>
              <p className="muted">Only active approved templates should be used for production sending.</p>
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
                      <ProfileRow label="Meta template ID" value={template.metaTemplateId || "Not synced"} />
                      <ProfileRow label="Variables" value={template.variables.join(", ") || "None"} />
                      <ProfileRow label="Created" value={formatDate(template.createdAt)} />
                    </div>
                    {template.bodyPreview ? (
                      <pre className="email-preview">{template.bodyPreview}</pre>
                    ) : null}
                    <div className="toolbar" style={{ marginBottom: 0 }}>
                      <form action={submitWhatsappTemplateToMeta}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <button className="secondary-button" type="submit">
                          <UploadCloud size={16} aria-hidden="true" /> Submit to Meta
                        </button>
                      </form>
                      <form action={syncWhatsappTemplateFromMeta}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <button className="secondary-button" type="submit">
                          <RefreshCcw size={16} aria-hidden="true" /> Sync status
                        </button>
                      </form>
                    </div>
                    <form action={sendWhatsappTemplateTest} className="stack">
                      <input type="hidden" name="templateId" value={template.id} />
                      <label className="field">
                        <span>Test phone</span>
                        <input
                          className="input"
                          name="toPhoneE164"
                          type="tel"
                          inputMode="tel"
                          pattern="^\+[1-9][0-9]{7,14}$"
                          placeholder="+96560000000"
                          required
                        />
                        <small>Use full international format with + and country code.</small>
                      </label>
                      {template.variables.map((variable) => (
                        <label className="field" key={variable}>
                          <span>Test value for {variable}</span>
                          <input className="input" name={`testVar:${variable}`} placeholder="Test value" />
                        </label>
                      ))}
                      <button className="secondary-button" type="submit">
                        <Send size={16} aria-hidden="true" /> Test send
                      </button>
                    </form>
                  </div>
                </details>
              ))
            ) : (
              <div className="empty-state">Add a Meta template first.</div>
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
