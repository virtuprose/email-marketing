import { EmailDesignValidationStatus } from "@prisma/client";
import { ArrowLeft, MailCheck, Palette, Send } from "lucide-react";
import Link from "next/link";
import { sendGlobalEmailDesignTest } from "@/app/actions";
import { EmailTemplatePreviewDialog } from "@/components/email-template-preview-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  EMAIL_DESIGN_SAMPLE_BODY,
  EMAIL_DESIGN_SAMPLE_LEAD,
  EMAIL_DESIGN_SAMPLE_SUBJECT,
  getActiveEmailDesignTemplates,
  renderEmailDesignTemplateHtml
} from "@/lib/email-design-template-library";
import { COMPLIANCE_SETTINGS_KEY, parseComplianceSettings } from "@/lib/settings";
import { appBaseUrl, ensureDefaultSendingAccount } from "@/lib/sending";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EmailDesignTemplatesPage() {
  await ensureDefaultSendingAccount();

  const [templates, sendingAccounts, complianceSetting] = await Promise.all([
    getActiveEmailDesignTemplates(),
    prisma.sendingAccount.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.setting.findUnique({ where: { key: COMPLIANCE_SETTINGS_KEY } })
  ]);
  const compliance = parseComplianceSettings(complianceSetting?.value);
  const senderName = sendingAccounts[0]?.fromName || compliance.senderName || "Virtuprose";
  const unsubscribeUrl = compliance.unsubscribeUrl || `${appBaseUrl()}/unsubscribe/test-preview`;

  return (
    <>
      <PageHeader
        eyebrow="Email design"
        title="Email Design Templates"
        description="Manage the premium visual wrapper used by email campaigns. V1 ships one fixed Virtuprose template."
        actions={
          <>
            <Link className="secondary-button" href="/campaigns">
              <ArrowLeft size={16} aria-hidden="true" /> Campaigns
            </Link>
            <Link className="button" href="/campaigns/new">
              <Send size={16} aria-hidden="true" /> New campaign
            </Link>
          </>
        }
      />

      <section className="grid grid-2 email-template-library" aria-label="Email design templates">
        {templates.map((template) => {
          const preview = renderEmailDesignTemplateHtml({
            template,
            subject: EMAIL_DESIGN_SAMPLE_SUBJECT,
            body: EMAIL_DESIGN_SAMPLE_BODY,
            lead: EMAIL_DESIGN_SAMPLE_LEAD,
            senderName,
            unsubscribeUrl
          });
          const isValid = template.status === EmailDesignValidationStatus.VALID;

          return (
            <article className="panel email-template-card" key={template.id}>
              <div className="panel-header">
                <div>
                  <div className="email-template-icon" aria-hidden="true">
                    <Palette size={18} />
                  </div>
                  <h2>{template.name}</h2>
                  <p className="muted">{template.description}</p>
                </div>
                <div className="tag-list">
                  {template.builtIn ? <span className="tag">Built-in</span> : null}
                  <StatusBadge label={isValid ? "Ready" : "Blocked"} status={isValid ? "PASS" : "BLOCK"} />
                </div>
              </div>

              <div className="panel-body stack">
                <div className="email-template-meta">
                  <div>
                    <span>Usage</span>
                    <strong>Campaign-wide wrapper</strong>
                  </div>
                  <div>
                    <span>Images</span>
                    <strong>No external images</strong>
                  </div>
                  <div>
                    <span>Mobile</span>
                    <strong>Responsive email layout</strong>
                  </div>
                </div>

                {template.errors.length ? (
                  <div className="alert danger-alert">
                    <strong>Fix before use</strong>
                    <ul className="compact-list">
                      {template.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {template.warnings.length ? (
                  <div className="alert">
                    <strong>Warnings</strong>
                    <ul className="compact-list">
                      {template.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="email-design-actions">
                  <EmailTemplatePreviewDialog
                    title={`${template.name} preview`}
                    description="Rendered with sample Virtuprose campaign copy and personalization tokens."
                    html={preview.bodyHtml}
                  />
                  <Link className="secondary-button" href="/campaigns">
                    Use in campaign
                  </Link>
                </div>

                <form action={sendGlobalEmailDesignTest} className="email-template-test-form">
                  <input type="hidden" name="templateId" value={template.id} />
                  <label className="field">
                    <span>Send from</span>
                    <select className="select" name="sendingAccountId">
                      {sendingAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} - {account.dryRun ? "test mode" : "live SMTP"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Test recipient</span>
                    <input className="input" name="to" type="email" placeholder="you@example.com" required />
                  </label>
                  <button className="button" type="submit" disabled={!sendingAccounts.length || !isValid}>
                    <MailCheck size={16} aria-hidden="true" /> Send test email
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
