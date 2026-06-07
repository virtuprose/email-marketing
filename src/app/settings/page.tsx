import { Save, Send, ShieldCheck, Siren } from "lucide-react";
import {
  sendSendingAccountTest,
  updateComplianceSettings,
  updateSendingAccount,
  updateSendingControl
} from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { COMPLIANCE_SETTINGS_KEY, parseComplianceSettings } from "@/lib/settings";
import {
  conservativeDefaultLimits,
  ensureDefaultSendingAccount,
  parseSendingControl,
  SENDING_CONTROL_SETTINGS_KEY,
  smtpPasswordConfigured
} from "@/lib/sending";
import { sendingAccountStatusLabels } from "@/lib/status";
import {
  appBaseUrl,
  isMetaWhatsappConfigured,
  isMetaWhatsappDryRun,
  WHATSAPP_WEBHOOK_PATH
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [setting, controlSetting, account] = await Promise.all([
    prisma.setting.findUnique({ where: { key: COMPLIANCE_SETTINGS_KEY } }),
    prisma.setting.findUnique({ where: { key: SENDING_CONTROL_SETTINGS_KEY } }),
    ensureDefaultSendingAccount()
  ]);
  const compliance = parseComplianceSettings(setting?.value);
  const control = parseSendingControl(controlSetting?.value);
  const limits = account.limits ?? conservativeDefaultLimits();
  const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const inboundSecretConfigured = Boolean(process.env.INBOUND_WEBHOOK_SECRET);
  const smtpPassConfigured = smtpPasswordConfigured();
  const metaConfigured = isMetaWhatsappConfigured();
  const metaDryRun = isMetaWhatsappDryRun();
  const metaSignatureValidation = process.env.META_VALIDATE_SIGNATURE !== "false";

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Set your business details, sending safety, WhatsApp connection, and AI handoff rules."
      />

      <div className="grid grid-2">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Business Profile</h2>
              <p className="muted">
                These details appear in your emails and help keep outreach clear and trustworthy.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <form action={updateComplianceSettings} className="stack">
              <div className="form-grid">
                <label className="field">
                  <span>Sender name</span>
                  <input
                    className="input"
                    name="senderName"
                    required
                    defaultValue={compliance.senderName ?? ""}
                    placeholder="Virtuprose"
                  />
                </label>
                <label className="field">
                  <span>Sender email</span>
                  <input
                    className="input"
                    name="senderEmail"
                    type="email"
                    required
                    defaultValue={compliance.senderEmail ?? ""}
                    placeholder="hello@virtuprose.com"
                  />
                </label>
              </div>

              <label className="field">
                <span>Business address</span>
                <textarea
                  className="textarea"
                  name="physicalAddress"
                  required
                  defaultValue={compliance.physicalAddress ?? ""}
                  placeholder="Business address used for compliance footer"
                />
                <small>Required for compliant marketing and outreach footers in many regions.</small>
              </label>

              <label className="field">
                <span>Unsubscribe page</span>
                <input
                  className="input"
                  name="unsubscribeUrl"
                  type="url"
                  required
                  defaultValue={compliance.unsubscribeUrl ?? ""}
                  placeholder="https://virtuprose.com/unsubscribe"
                />
                <small>The assistant adds the correct unsubscribe link when sending emails.</small>
              </label>

              <button className="button" type="submit">
                <Save size={16} aria-hidden="true" /> Save business profile
              </button>
            </form>
          </div>
        </section>

        <details className="panel advanced-settings">
          <summary className="panel-summary">
            <div>
              <h2>Advanced email setup</h2>
              <p className="muted">Open this only when changing the email sending account or limits.</p>
            </div>
            <StatusBadge label={sendingAccountStatusLabels[account.status]} status={account.status} />
          </summary>
          <div className="panel-body">
            <form action={updateSendingAccount} className="stack">
              <input type="hidden" name="id" value={account.id} />
              <label className="field">
                <span>Account name</span>
                <input className="input" name="name" required defaultValue={account.name} />
              </label>

              <div className="form-grid">
                <label className="field">
                  <span>From name</span>
                  <input className="input" name="fromName" required defaultValue={account.fromName} />
                </label>
                <label className="field">
                  <span>From email</span>
                  <input
                    className="input"
                    name="fromEmail"
                    type="email"
                    required
                    defaultValue={account.fromEmail}
                  />
                </label>
                <label className="field">
                  <span>Reply-to</span>
                  <input className="input" name="replyTo" type="email" defaultValue={account.replyTo ?? ""} />
                </label>
                <label className="field checkbox-field">
                  <input name="dryRun" type="checkbox" defaultChecked={account.dryRun} />
                  <span>Test mode</span>
                  <small>When this is on, emails are recorded but not actually sent.</small>
                </label>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>SMTP host</span>
                  <input className="input" name="host" defaultValue={account.host ?? ""} />
                </label>
                <label className="field">
                  <span>SMTP username</span>
                  <input className="input" name="username" defaultValue={account.username ?? ""} />
                </label>
                <label className="field">
                  <span>SMTP port</span>
                  <input className="input" name="port" type="number" min={1} defaultValue={account.port} />
                </label>
                <label className="field checkbox-field">
                  <input name="secure" type="checkbox" defaultChecked={account.secure} />
                  <span>Use secure TLS</span>
                  <small>Usually enabled for port 465.</small>
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
                    defaultValue={limits.dailyCap}
                  />
                </label>
                <label className="field">
                  <span>Per-minute sending limit</span>
                  <input
                    className="input"
                    name="perMinuteCap"
                    type="number"
                    min={1}
                    defaultValue={limits.perMinuteCap}
                  />
                </label>
                <label className="field">
                  <span>Daily limit for same company email domain</span>
                  <input
                    className="input"
                    name="perDomainDailyCap"
                    type="number"
                    min={1}
                    defaultValue={limits.perDomainDailyCap}
                  />
                </label>
                <label className="field">
                  <span>Delay between sends</span>
                  <input
                    className="input"
                    name="minDelaySeconds"
                    type="number"
                    min={1}
                    defaultValue={limits.minDelaySeconds}
                  />
                </label>
              </div>

              <div className={account.dryRun || smtpPassConfigured ? "alert success-alert" : "alert"}>
                {account.dryRun
                  ? "Test mode is on. Nothing will be sent by email."
                  : smtpPassConfigured
                    ? "Email sending password is configured."
                    : "Email sending password is missing. Keep test mode on until it is added."}
              </div>

              <button className="button" type="submit">
                <Save size={16} aria-hidden="true" /> Save email setup
              </button>
            </form>
          </div>
        </details>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Email test</h2>
              <p className="muted">Send one test email to confirm the account before a campaign.</p>
            </div>
            <Send size={18} aria-hidden="true" />
          </div>
          <div className="panel-body">
            <form action={sendSendingAccountTest} className="stack">
              <input type="hidden" name="sendingAccountId" value={account.id} />
              <label className="field">
                <span>Test recipient</span>
                <input className="input" name="to" type="email" required placeholder="you@virtuprose.com" />
              </label>
              <button className="secondary-button" type="submit">
                Send test to me
              </button>
              {account.lastTestAt ? (
                <p className="muted">Last test ran {account.lastTestAt.toLocaleString()}.</p>
              ) : null}
            </form>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Sending Safety</h2>
              <p className="muted">These controls explain why sending may be paused or blocked.</p>
            </div>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div className="panel-body stack">
            <ReadinessRow label="Sender name" ready={Boolean(compliance.senderName)} />
            <ReadinessRow label="Sender email" ready={Boolean(compliance.senderEmail)} />
            <ReadinessRow label="Business address" ready={Boolean(compliance.physicalAddress)} />
            <ReadinessRow
              label="Campaign writing AI"
              ready={openAiConfigured}
              fallback="Local fallback active"
            />
            <ReadinessRow label="Reply AI" ready={openAiConfigured} fallback="Local classifier active" />
            <ReadinessRow
              label="Automatic reply connection"
              ready={inboundSecretConfigured}
              fallback="Manual reply import"
            />
            <ReadinessRow
              label="Reply-to inbox"
              ready={Boolean(account.replyTo)}
              fallback="Set reply-to email"
            />
            <ReadinessRow
              label="Email sending password"
              ready={smtpPassConfigured || account.dryRun}
              fallback="Use test mode"
            />
            <ReadinessRow label="WhatsApp" ready={metaConfigured || metaDryRun} fallback="Needs setup" />

            <form action={updateSendingControl} className="kill-switch">
              <label className="checkbox-field">
                <input name="killSwitch" type="checkbox" defaultChecked={Boolean(control.killSwitch)} />
                <span>Pause all sending</span>
              </label>
              <button className={control.killSwitch ? "button" : "danger-button"} type="submit">
                <Siren size={16} aria-hidden="true" />
                {control.killSwitch ? "Save pause setting" : "Pause all sending"}
              </button>
            </form>
          </div>
        </section>
      </div>

      <details className="panel advanced-settings" style={{ marginTop: 16 }}>
        <summary className="panel-summary">
          <div>
            <h2>Advanced automatic reply setup</h2>
            <p className="muted">
              Use this only when connecting an email provider to receive replies automatically.
            </p>
          </div>
        </summary>
        <div className="panel-body stack">
          <div className="profile-row">
            <span>Reply connection URL</span>
            <span>{`${process.env.APP_BASE_URL || "http://localhost:3000"}/api/inbound/replies`}</span>
          </div>
          <div className="profile-row">
            <span>Security header</span>
            <span>x-inbound-secret</span>
          </div>
          <div className={inboundSecretConfigured ? "alert success-alert" : "alert"}>
            {inboundSecretConfigured
              ? "Automatic reply connection is protected."
              : "Add the reply connection secret before using this publicly."}
          </div>
        </div>
      </details>

      <details className="panel advanced-settings" style={{ marginTop: 16 }}>
        <summary className="panel-summary">
          <div>
            <h2>Advanced WhatsApp setup</h2>
            <p className="muted">Open this when connecting WhatsApp or checking the callback URL.</p>
          </div>
        </summary>
        <div className="panel-body stack">
          <div className="profile-row">
            <span>WhatsApp callback URL</span>
            <span>{`${appBaseUrl()}${WHATSAPP_WEBHOOK_PATH}`}</span>
          </div>
          <div className="profile-row">
            <span>WhatsApp mode</span>
            <StatusBadge label={metaDryRun ? "Test mode" : "Live"} status={metaDryRun ? "DRAFT" : "PASS"} />
          </div>
          <div className="profile-row">
            <span>Message security check</span>
            <StatusBadge
              label={metaSignatureValidation ? "Enabled" : "Disabled"}
              status={metaSignatureValidation ? "PASS" : "WARNING"}
            />
          </div>
          <div className="profile-row">
            <span>Connection token</span>
            <span>{process.env.META_WEBHOOK_VERIFY_TOKEN ? "Configured" : "Missing"}</span>
          </div>
          <div className={metaConfigured ? "alert success-alert" : "alert"}>
            {metaConfigured
              ? "WhatsApp is configured."
              : "Add WhatsApp connection values before turning live mode on."}
          </div>
        </div>
      </details>
    </>
  );
}

function ReadinessRow({ label, ready, fallback }: { label: string; ready: boolean; fallback?: string }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <StatusBadge label={ready ? "Ready" : fallback || "Missing"} status={ready ? "PASS" : "DRAFT"} />
    </div>
  );
}
