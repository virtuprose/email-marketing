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

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Compliance, sending, and AI controls"
        description="Configure legal identity, SMTP, reply ingestion, AI fallbacks, and emergency controls before real outreach volume."
      />

      <div className="grid grid-2">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Sender identity</h2>
              <p className="muted">
                Use real business details before any production campaign leaves the system.
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
                <span>Physical mailing address</span>
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
                <span>Unsubscribe base URL</span>
                <input
                  className="input"
                  name="unsubscribeUrl"
                  type="url"
                  required
                  defaultValue={compliance.unsubscribeUrl ?? ""}
                  placeholder="https://virtuprose.com/unsubscribe"
                />
                <small>Phase 3 generates recipient-specific unsubscribe links at send time.</small>
              </label>

              <button className="button" type="submit">
                <Save size={16} aria-hidden="true" /> Save identity
              </button>
            </form>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>SMTP account</h2>
              <p className="muted">
                Dry-run is safe for local QA. Turn it off only after SMTP env vars are set.
              </p>
            </div>
            <StatusBadge label={sendingAccountStatusLabels[account.status]} status={account.status} />
          </div>
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
                  <span>Dry-run mode</span>
                  <small>Queue and log sends without contacting SMTP.</small>
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
                  <span>Daily cap</span>
                  <input
                    className="input"
                    name="dailyCap"
                    type="number"
                    min={1}
                    defaultValue={limits.dailyCap}
                  />
                </label>
                <label className="field">
                  <span>Per-minute cap</span>
                  <input
                    className="input"
                    name="perMinuteCap"
                    type="number"
                    min={1}
                    defaultValue={limits.perMinuteCap}
                  />
                </label>
                <label className="field">
                  <span>Per-domain daily cap</span>
                  <input
                    className="input"
                    name="perDomainDailyCap"
                    type="number"
                    min={1}
                    defaultValue={limits.perDomainDailyCap}
                  />
                </label>
                <label className="field">
                  <span>Minimum delay seconds</span>
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
                  ? "Dry-run is active. Scheduling will create queue jobs and mark messages sent without external delivery."
                  : smtpPassConfigured
                    ? "SMTP password is configured in the environment."
                    : "SMTP password is missing. Set SMTP_PASS before disabling dry-run."}
              </div>

              <button className="button" type="submit">
                <Save size={16} aria-hidden="true" /> Save SMTP account
              </button>
            </form>
          </div>
        </section>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Test send</h2>
              <p className="muted">
                Uses the current sending mode. In dry-run, it records a test event only.
              </p>
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
                Send test
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
              <h2>Readiness and kill switch</h2>
              <p className="muted">These controls explain why sending may be paused.</p>
            </div>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div className="panel-body stack">
            <ReadinessRow label="Sender name" ready={Boolean(compliance.senderName)} />
            <ReadinessRow label="Sender email" ready={Boolean(compliance.senderEmail)} />
            <ReadinessRow label="Physical address" ready={Boolean(compliance.physicalAddress)} />
            <ReadinessRow
              label="OpenAI campaign generation"
              ready={openAiConfigured}
              fallback="Local fallback active"
            />
            <ReadinessRow
              label="OpenAI reply agent"
              ready={openAiConfigured}
              fallback="Local classifier active"
            />
            <ReadinessRow
              label="Inbound webhook secret"
              ready={inboundSecretConfigured}
              fallback="Manual reply import only"
            />
            <ReadinessRow
              label="Reply-to inbox"
              ready={Boolean(account.replyTo)}
              fallback="Set reply-to email"
            />
            <ReadinessRow
              label="SMTP password"
              ready={smtpPassConfigured || account.dryRun}
              fallback="Dry-run required"
            />

            <form action={updateSendingControl} className="kill-switch">
              <label className="checkbox-field">
                <input name="killSwitch" type="checkbox" defaultChecked={Boolean(control.killSwitch)} />
                <span>Global kill switch</span>
              </label>
              <button className={control.killSwitch ? "button" : "danger-button"} type="submit">
                <Siren size={16} aria-hidden="true" />
                {control.killSwitch ? "Save control" : "Pause all sending"}
              </button>
            </form>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div>
            <h2>Inbound reply endpoint</h2>
            <p className="muted">
              Use this when you connect an email provider inbound parser. Until then, paste replies in the AI
              inbox.
            </p>
          </div>
        </div>
        <div className="panel-body stack">
          <div className="profile-row">
            <span>Webhook URL</span>
            <span>{`${process.env.APP_BASE_URL || "http://localhost:3000"}/api/inbound/replies`}</span>
          </div>
          <div className="profile-row">
            <span>Header</span>
            <span>x-inbound-secret</span>
          </div>
          <div className={inboundSecretConfigured ? "alert success-alert" : "alert"}>
            {inboundSecretConfigured
              ? "Inbound webhook is protected by INBOUND_WEBHOOK_SECRET."
              : "Set INBOUND_WEBHOOK_SECRET before exposing the inbound endpoint publicly."}
          </div>
        </div>
      </section>
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
