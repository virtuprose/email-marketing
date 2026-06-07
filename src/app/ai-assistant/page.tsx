import { MessageChannel, ReplyStatus } from "@prisma/client";
import { Bot, Mail, MessageCircle, Save, Send, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { testAiAssistantReply, updateAiAssistantSettings } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  AI_ASSISTANT_LAST_TEST_KEY,
  AI_ASSISTANT_SETTINGS_KEY,
  defaultAiAssistantSettings,
  getAiAssistantSettings,
  parseAiAssistantSettings,
  recentAiAssistantActivity
} from "@/lib/ai-assistant";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { ensureDefaultSendingAccount, smtpPasswordConfigured } from "@/lib/sending";
import { isMetaWhatsappConfigured, isMetaWhatsappDryRun } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function AiAssistantPage() {
  const [settings, persistedSetting, lastTestSetting, account, counts, activity, lastReply] =
    await Promise.all([
      getAiAssistantSettings(),
      prisma.setting.findUnique({ where: { key: AI_ASSISTANT_SETTINGS_KEY } }),
      prisma.setting.findUnique({ where: { key: AI_ASSISTANT_LAST_TEST_KEY } }),
      ensureDefaultSendingAccount(),
      getCounts(),
      recentAiAssistantActivity(18),
      prisma.inboundReply.findFirst({ orderBy: { receivedAt: "desc" } })
    ]);
  const savedSettings = parseAiAssistantSettings(persistedSetting?.value);
  const openAiReady = Boolean(process.env.OPENAI_API_KEY);
  const whatsappReady = isMetaWhatsappConfigured() || isMetaWhatsappDryRun();
  const emailSendingLive =
    !account.dryRun && Boolean(account.host && account.username && smtpPasswordConfigured());
  const imapReady = Boolean(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS);
  const criticalWarnings = [
    !openAiReady ? "OpenAI is missing, so real AI quality is unavailable." : null,
    settings.mode === "PAUSED" ? "AI Assistant is paused." : null,
    !whatsappReady ? "WhatsApp replies need setup." : null,
    !emailSendingLive
      ? "Hot lead email alerts are not live yet. Add SMTP credentials and turn off email test mode."
      : null,
    !imapReady ? "Email reply inbox is not connected yet." : null
  ].filter(Boolean) as string[];
  const lastTest = parseLastTest(lastTestSetting?.value);

  return (
    <>
      <PageHeader
        eyebrow="AI Assistant"
        title="AI employee controls"
        description="Control how AI reads replies, sends safe answers, and hands hot leads to you."
      />

      <section className="grid grid-4" aria-label="AI assistant status">
        <Metric
          icon={<Bot size={18} />}
          label="Auto replies"
          value={modeLabel(settings.mode)}
          note="Current mode"
        />
        <Metric
          icon={<MessageCircle size={18} />}
          label="WhatsApp replies"
          value={whatsappReady && settings.channels.whatsapp.enabled ? "Ready" : "Needs setup"}
          note={settings.channels.whatsapp.autoReply ? "Auto Safe allowed" : "Draft only"}
        />
        <Metric
          icon={<Mail size={18} />}
          label="Email replies"
          value={settings.channels.email.enabled ? "Ready" : "Needs setup"}
          note={emailSendingLive ? "Live sending" : account.dryRun ? "Test sending only" : "SMTP needs setup"}
        />
        <Metric
          icon={<Sparkles size={18} />}
          label="Hot lead alerts"
          value={settings.ownerHotLeadEmail}
          note={emailSendingLive ? "Live owner email" : "Test mode only"}
        />
      </section>

      {criticalWarnings.length ? (
        <section className="alert danger-alert" style={{ marginTop: 16 }}>
          <strong>Needs attention</strong>
          <ul className="compact-list">
            {criticalWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="alert success-alert" style={{ marginTop: 16 }}>
          <strong>AI Assistant is ready.</strong> Safe replies can be drafted and sent according to your
          rules.
        </section>
      )}

      <section className="grid grid-4" aria-label="AI assistant metrics" style={{ marginTop: 16 }}>
        <Metric
          icon={<Send size={18} />}
          label="Replies received"
          value={formatNumber(counts.replies)}
          note="All channels"
        />
        <Metric
          icon={<Sparkles size={18} />}
          label="Drafts created"
          value={formatNumber(counts.drafts)}
          note="AI drafts"
        />
        <Metric
          icon={<ShieldCheck size={18} />}
          label="AI replies sent"
          value={formatNumber(counts.sentDrafts)}
          note="Auto/manual"
        />
        <Metric
          icon={<TriangleAlert size={18} />}
          label="Needs you"
          value={formatNumber(counts.needsOwner)}
          note="Owner review"
        />
      </section>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Reply mode</h2>
              <p className="muted">Choose how much freedom the AI employee has.</p>
            </div>
            <StatusBadge
              label={settings.enabled ? modeLabel(settings.mode) : "Off"}
              status={settings.enabled ? "ACTIVE" : "PAUSED"}
            />
          </div>
          <div className="panel-body">
            <form action={updateAiAssistantSettings} className="stack">
              <label className="field checkbox-field">
                <input name="enabled" type="checkbox" defaultChecked={savedSettings.enabled} />
                <span>AI Assistant is on</span>
                <small>Turn this off to stop AI classification, drafts, and auto replies.</small>
              </label>

              <label className="field">
                <span>Reply mode</span>
                <select className="select" name="mode" defaultValue={savedSettings.mode}>
                  <option value="AUTO_SAFE">Auto Safe</option>
                  <option value="DRAFT_ONLY">Draft Only</option>
                  <option value="TEST_MODE">Test Mode</option>
                  <option value="PAUSED">Paused</option>
                </select>
              </label>

              <div className="form-grid">
                <label className="field checkbox-field">
                  <input
                    name="whatsappEnabled"
                    type="checkbox"
                    defaultChecked={savedSettings.channels.whatsapp.enabled}
                  />
                  <span>WhatsApp replies</span>
                </label>
                <label className="field checkbox-field">
                  <input
                    name="whatsappAutoReply"
                    type="checkbox"
                    defaultChecked={savedSettings.channels.whatsapp.autoReply}
                  />
                  <span>WhatsApp auto safe replies</span>
                </label>
                <label className="field checkbox-field">
                  <input
                    name="emailEnabled"
                    type="checkbox"
                    defaultChecked={savedSettings.channels.email.enabled}
                  />
                  <span>Email replies</span>
                </label>
                <label className="field checkbox-field">
                  <input
                    name="emailAutoReply"
                    type="checkbox"
                    defaultChecked={savedSettings.channels.email.autoReply}
                  />
                  <span>Email auto safe replies</span>
                </label>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>Minimum confidence to auto-send</span>
                  <input
                    className="input"
                    name="autoSendMinimum"
                    type="number"
                    min={50}
                    max={100}
                    defaultValue={savedSettings.confidence.autoSendMinimum}
                  />
                </label>
                <label className="field">
                  <span>Minimum confidence to draft</span>
                  <input
                    className="input"
                    name="draftMinimum"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={savedSettings.confidence.draftMinimum}
                  />
                </label>
                <label className="field">
                  <span>Fastest reply delay</span>
                  <input
                    className="input"
                    name="minReplyDelaySeconds"
                    type="number"
                    min={0}
                    max={3600}
                    defaultValue={savedSettings.timing.minReplyDelaySeconds}
                  />
                </label>
                <label className="field">
                  <span>Slowest reply delay</span>
                  <input
                    className="input"
                    name="maxReplyDelaySeconds"
                    type="number"
                    min={0}
                    max={3600}
                    defaultValue={savedSettings.timing.maxReplyDelaySeconds}
                  />
                </label>
                <label className="field">
                  <span>Daily AI reply limit</span>
                  <input
                    className="input"
                    name="dailyAutoReplyCap"
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={savedSettings.timing.dailyAutoReplyCap}
                  />
                </label>
                <label className="field">
                  <span>Hot lead alert email</span>
                  <input
                    className="input"
                    name="ownerHotLeadEmail"
                    type="email"
                    defaultValue={savedSettings.ownerHotLeadEmail}
                  />
                </label>
              </div>

              <PromptFields settings={savedSettings} />
              <KnowledgeFields settings={savedSettings} />

              <button className="button" type="submit">
                <Save size={16} aria-hidden="true" /> Save AI Assistant
              </button>
            </form>
          </div>
        </section>

        <aside className="stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Test AI</h2>
                <p className="muted">Paste a reply and see what AI would do. Nothing is sent.</p>
              </div>
            </div>
            <div className="panel-body">
              <form action={testAiAssistantReply} className="stack">
                <label className="field">
                  <span>Channel</span>
                  <select className="select" name="channel" defaultValue={MessageChannel.WHATSAPP}>
                    <option value={MessageChannel.WHATSAPP}>WhatsApp</option>
                    <option value={MessageChannel.EMAIL}>Email</option>
                  </select>
                </label>
                <label className="field">
                  <span>Email subject</span>
                  <input className="input" name="subject" placeholder="Only needed for email" />
                </label>
                <label className="field">
                  <span>Lead reply</span>
                  <textarea
                    className="textarea"
                    name="bodyText"
                    required
                    placeholder="Can you send examples?"
                  />
                </label>
                <button className="secondary-button" type="submit">
                  <Sparkles size={16} aria-hidden="true" /> Test AI
                </button>
              </form>
              {lastTest ? <TestResult result={lastTest} /> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Activity</h2>
                <p className="muted">Recent AI decisions, alerts, and reply actions.</p>
              </div>
            </div>
            <div className="panel-body stack">
              {activity.length ? (
                activity.map((item) => (
                  <div className="reply-list-item" key={item.id}>
                    <span className="reply-list-main">
                      <strong>{activityLabel(item.action)}</strong>
                      <span>{formatDate(item.createdAt)}</span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">No AI activity yet.</div>
              )}
              <div className="profile-row">
                <span>Last reply handled</span>
                <span>{lastReply ? formatDate(lastReply.receivedAt) : "None yet"}</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

async function getCounts() {
  const [replies, drafts, sentDrafts, needsOwner] = await Promise.all([
    prisma.inboundReply.count(),
    prisma.aiReplyDraft.count(),
    prisma.aiReplyDraft.count({ where: { status: "SENT" } }),
    prisma.inboundReply.count({
      where: {
        ownerActionRequired: true,
        status: { in: [ReplyStatus.OWNER_REVIEW, ReplyStatus.HOT_HANDOFF] }
      }
    })
  ]);
  return { replies, drafts, sentDrafts, needsOwner };
}

function PromptFields({ settings }: { settings: typeof defaultAiAssistantSettings }) {
  return (
    <details className="advanced-settings">
      <summary className="panel-summary">
        <div>
          <h3>Prompts</h3>
          <p className="muted">Edit only when you want to change how AI thinks and replies.</p>
        </div>
      </summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <TextAreaField
          name="businessRules"
          label="Business rules prompt"
          value={settings.prompts.businessRules}
        />
        <TextAreaField
          name="classifier"
          label="Reply classification prompt"
          value={settings.prompts.classifier}
        />
        <TextAreaField
          name="whatsappReply"
          label="WhatsApp reply prompt"
          value={settings.prompts.whatsappReply}
        />
        <TextAreaField name="emailReply" label="Email reply prompt" value={settings.prompts.emailReply} />
        <TextAreaField name="safety" label="Safety rules prompt" value={settings.prompts.safety} />
      </div>
    </details>
  );
}

function KnowledgeFields({ settings }: { settings: typeof defaultAiAssistantSettings }) {
  return (
    <details className="advanced-settings">
      <summary className="panel-summary">
        <div>
          <h3>Knowledge base</h3>
          <p className="muted">Approved facts AI can use. One item per line for lists.</p>
        </div>
      </summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <TextAreaField
          name="companyIntro"
          label="Company intro"
          value={settings.knowledgeBase.companyIntro}
        />
        <TextAreaField name="services" label="Services" value={settings.knowledgeBase.services.join("\n")} />
        <TextAreaField
          name="portfolioLinks"
          label="Approved portfolio links"
          value={settings.knowledgeBase.portfolioLinks.join("\n")}
        />
        <TextAreaField
          name="pricingRules"
          label="Pricing rules"
          value={settings.knowledgeBase.pricingRules.join("\n")}
        />
        <TextAreaField name="faqs" label="FAQs" value={settings.knowledgeBase.faqs.join("\n")} />
        <TextAreaField
          name="forbiddenClaims"
          label="Things AI must never claim"
          value={settings.knowledgeBase.forbiddenClaims.join("\n")}
        />
      </div>
    </details>
  );
}

function TextAreaField({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea className="textarea" name={name} defaultValue={value} rows={4} />
    </label>
  );
}

function TestResult({ result }: { result: AiTestResult }) {
  return (
    <div className="alert success-alert" style={{ marginTop: 12 }}>
      <strong>AI result</strong>
      <div className="profile-list" style={{ marginTop: 8 }}>
        <div className="profile-row">
          <span>Intent</span>
          <span>{result.analysis.intent}</span>
        </div>
        <div className="profile-row">
          <span>Confidence</span>
          <span>{result.analysis.confidence}%</span>
        </div>
        <div className="profile-row">
          <span>Decision</span>
          <span>{result.decision.shouldAutoSend ? "Would auto-reply" : "Would wait"}</span>
        </div>
      </div>
      {result.decision.reasons.length ? (
        <ul className="compact-list">
          {result.decision.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <pre className="email-preview">{result.draft.bodyText}</pre>
    </div>
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
  value: string;
  note: string;
}) {
  return (
    <div className="panel metric">
      <p className="metric-label">
        {icon} {label}
      </p>
      <p className="metric-value metric-inline">{value}</p>
      <p className="metric-note">{note}</p>
    </div>
  );
}

function modeLabel(mode: string) {
  const labels: Record<string, string> = {
    AUTO_SAFE: "Auto Safe",
    DRAFT_ONLY: "Draft Only",
    PAUSED: "Paused",
    TEST_MODE: "Test Mode"
  };
  return labels[mode] ?? mode;
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "reply.ai_classified": "AI reviewed a reply",
    "reply.ai_draft_sent": "AI reply sent",
    "ai_assistant.decision": "AI made a send decision",
    "ai_assistant.queued_decision": "AI rechecked before sending",
    "ai_assistant.hot_lead_alert_sent": "Hot lead alert sent",
    "ai_assistant.hot_lead_alert_failed": "Hot lead alert failed",
    "email_reply.imap_poll_failed": "Email inbox check failed",
    "email_reply.imap_poll_processed": "Email inbox checked"
  };
  return labels[action] ?? action;
}

type AiTestResult = {
  analysis: { intent: string; confidence: number };
  draft: { bodyText: string };
  decision: { shouldAutoSend: boolean; reasons: string[] };
};

function parseLastTest(value: unknown): AiTestResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const analysis = record.analysis as Record<string, unknown> | undefined;
  const draft = record.draft as Record<string, unknown> | undefined;
  const decision = record.decision as Record<string, unknown> | undefined;
  if (!analysis || !draft || !decision) return null;
  return {
    analysis: {
      intent: typeof analysis.intent === "string" ? analysis.intent : "UNKNOWN",
      confidence: typeof analysis.confidence === "number" ? analysis.confidence : 0
    },
    draft: {
      bodyText: typeof draft.bodyText === "string" ? draft.bodyText : ""
    },
    decision: {
      shouldAutoSend: decision.shouldAutoSend === true,
      reasons: Array.isArray(decision.reasons)
        ? decision.reasons.filter((reason): reason is string => typeof reason === "string")
        : []
    }
  };
}
