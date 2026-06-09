"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateAiAssistantSettingsWithState,
  type AiAssistantSettingsActionState,
  type AiAssistantSettingsFormValues
} from "@/app/actions";

export function AiAssistantSettingsForm({ initialValues }: { initialValues: AiAssistantSettingsFormValues }) {
  const initialState: AiAssistantSettingsActionState = {
    status: "idle",
    message: "",
    fieldErrors: {},
    values: initialValues,
    formKey: "initial"
  };
  const [state, formAction] = useActionState(updateAiAssistantSettingsWithState, initialState);
  const values = state.values ?? initialValues;

  return (
    <form key={state.formKey} action={formAction} className="stack">
      {state.message ? (
        <div
          className={state.status === "success" ? "success-alert alert" : "danger-alert alert"}
          role="status"
        >
          {state.message}
        </div>
      ) : null}

      <label className="field checkbox-field">
        <input name="enabled" type="checkbox" defaultChecked={values.enabled} />
        <span>AI Assistant is on</span>
        <small>Turn this off to stop AI classification, drafts, and auto replies.</small>
      </label>

      <label className="field">
        <span>Reply mode</span>
        <select className="select" name="mode" defaultValue={values.mode}>
          <option value="AUTO_SAFE">Auto Safe</option>
          <option value="DRAFT_ONLY">Draft Only</option>
          <option value="TEST_MODE">Test Mode</option>
          <option value="PAUSED">Paused</option>
        </select>
        <FieldError name="mode" errors={state.fieldErrors} />
      </label>

      <div className="form-grid">
        <label className="field checkbox-field">
          <input name="whatsappEnabled" type="checkbox" defaultChecked={values.whatsappEnabled} />
          <span>WhatsApp replies</span>
        </label>
        <label className="field checkbox-field">
          <input name="whatsappAutoReply" type="checkbox" defaultChecked={values.whatsappAutoReply} />
          <span>WhatsApp auto safe replies</span>
        </label>
        <label className="field checkbox-field">
          <input name="emailEnabled" type="checkbox" defaultChecked={values.emailEnabled} />
          <span>Email replies</span>
        </label>
        <label className="field checkbox-field">
          <input name="emailAutoReply" type="checkbox" defaultChecked={values.emailAutoReply} />
          <span>Email auto safe replies</span>
        </label>
      </div>

      <div className="form-grid">
        <TextField
          name="autoSendMinimum"
          label="Minimum confidence to auto-send"
          value={values.autoSendMinimum}
          type="number"
          min={50}
          max={100}
          errors={state.fieldErrors}
        />
        <TextField
          name="draftMinimum"
          label="Minimum confidence to draft"
          value={values.draftMinimum}
          type="number"
          min={0}
          max={100}
          errors={state.fieldErrors}
        />
        <TextField
          name="minReplyDelaySeconds"
          label="Fastest reply delay"
          value={values.minReplyDelaySeconds}
          type="number"
          min={0}
          max={3600}
          errors={state.fieldErrors}
        />
        <TextField
          name="maxReplyDelaySeconds"
          label="Slowest reply delay"
          value={values.maxReplyDelaySeconds}
          type="number"
          min={0}
          max={3600}
          errors={state.fieldErrors}
        />
        <TextField
          name="dailyAutoReplyCap"
          label="Daily AI reply limit"
          value={values.dailyAutoReplyCap}
          type="number"
          min={1}
          max={1000}
          errors={state.fieldErrors}
        />
        <TextField
          name="ownerHotLeadEmail"
          label="Hot lead alert email"
          value={values.ownerHotLeadEmail}
          type="email"
          errors={state.fieldErrors}
        />
        <label className="field checkbox-field">
          <input
            name="meetingBookedEmailEnabled"
            type="checkbox"
            defaultChecked={values.meetingBookedEmailEnabled}
          />
          <span>Email me when meeting is booked</span>
          <small>AI sends an owner email after it books an approved slot.</small>
        </label>
        <TextField
          name="meetingBookedEmailRecipient"
          label="Meeting booked alert email"
          value={values.meetingBookedEmailRecipient}
          type="email"
          errors={state.fieldErrors}
        />
      </div>

      <PromptFields values={values} errors={state.fieldErrors} />
      <KnowledgeFields values={values} errors={state.fieldErrors} />

      <SubmitButton />
    </form>
  );
}

function PromptFields({
  values,
  errors
}: {
  values: AiAssistantSettingsFormValues;
  errors: Record<string, string[]>;
}) {
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
          value={values.businessRules}
          errors={errors}
        />
        <TextAreaField
          name="classifier"
          label="Reply classification prompt"
          value={values.classifier}
          errors={errors}
        />
        <TextAreaField
          name="whatsappReply"
          label="WhatsApp reply prompt"
          value={values.whatsappReply}
          errors={errors}
        />
        <TextAreaField
          name="emailReply"
          label="Email reply prompt"
          value={values.emailReply}
          errors={errors}
        />
        <TextAreaField name="safety" label="Safety rules prompt" value={values.safety} errors={errors} />
      </div>
    </details>
  );
}

function KnowledgeFields({
  values,
  errors
}: {
  values: AiAssistantSettingsFormValues;
  errors: Record<string, string[]>;
}) {
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
          value={values.companyIntro}
          errors={errors}
        />
        <TextAreaField name="services" label="Services" value={values.services} errors={errors} />
        <TextAreaField
          name="portfolioLinks"
          label="Approved portfolio links"
          value={values.portfolioLinks}
          errors={errors}
        />
        <TextAreaField
          name="pricingRules"
          label="Pricing rules"
          value={values.pricingRules}
          errors={errors}
        />
        <TextAreaField name="faqs" label="FAQs" value={values.faqs} errors={errors} />
        <TextAreaField
          name="forbiddenClaims"
          label="Things AI must never claim"
          value={values.forbiddenClaims}
          errors={errors}
        />
      </div>
    </details>
  );
}

function TextField({
  name,
  label,
  value,
  type = "text",
  min,
  max,
  errors
}: {
  name: keyof AiAssistantSettingsFormValues;
  label: string;
  value: string;
  type?: string;
  min?: number;
  max?: number;
  errors: Record<string, string[]>;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" name={name} type={type} min={min} max={max} defaultValue={value} />
      <FieldError name={name} errors={errors} />
    </label>
  );
}

function TextAreaField({
  name,
  label,
  value,
  errors
}: {
  name: keyof AiAssistantSettingsFormValues;
  label: string;
  value: string;
  errors: Record<string, string[]>;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea className="textarea" name={name} defaultValue={value} rows={4} />
      <FieldError name={name} errors={errors} />
    </label>
  );
}

function FieldError({ name, errors }: { name: string; errors: Record<string, string[]> }) {
  const message = errors[name]?.[0];
  return message ? <small className="field-error">{message}</small> : null;
}

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button className="button" type="submit" disabled={status.pending}>
      <Save size={16} aria-hidden="true" /> {status.pending ? "Saving..." : "Save AI Assistant"}
    </button>
  );
}
