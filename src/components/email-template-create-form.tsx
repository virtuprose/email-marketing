"use client";

import { Code2, Save, Upload } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createEmailDesignTemplateWithState,
  type EmailDesignTemplateActionState,
  type EmailDesignTemplateFormValues
} from "@/app/actions";

const emptyValues: EmailDesignTemplateFormValues = {
  name: "",
  description: "",
  html: ""
};

export function EmailTemplateCreateForm() {
  const initialState: EmailDesignTemplateActionState = {
    status: "idle",
    message: "",
    fieldErrors: {},
    values: emptyValues,
    formKey: "initial"
  };
  const [state, formAction] = useActionState(createEmailDesignTemplateWithState, initialState);
  const values = state.values ?? emptyValues;
  const alertClass =
    state.status === "success"
      ? "success-alert alert"
      : state.status === "warning"
        ? "alert"
        : "danger-alert alert";

  return (
    <section className="panel email-template-create-panel" aria-labelledby="new-email-template-title">
      <div className="panel-header">
        <div>
          <h2 id="new-email-template-title">Add email template</h2>
          <p className="muted">
            Save a reusable premium HTML wrapper. Campaign copy is inserted at <code>{"{{body_html}}"}</code>.
          </p>
        </div>
        <Code2 size={18} aria-hidden="true" />
      </div>
      <div className="panel-body">
        <form key={state.formKey} action={formAction} className="email-template-create-form">
          {state.message ? (
            <div className={alertClass} role="status">
              {state.message}
            </div>
          ) : null}

          <div className="form-grid">
            <label className="field">
              <span>Template name</span>
              <input
                className="input"
                name="name"
                defaultValue={values.name}
                placeholder="Elite Website Audit"
                required
              />
              <FieldError name="name" errors={state.fieldErrors} />
            </label>
            <label className="field">
              <span>Description</span>
              <input
                className="input"
                name="description"
                defaultValue={values.description}
                placeholder="Premium layout for website audit campaigns"
              />
              <FieldError name="description" errors={state.fieldErrors} />
            </label>
          </div>

          <label className="field">
            <span>Upload HTML file</span>
            <input className="input" name="htmlFile" type="file" accept=".html,text/html" />
            <small>Optional. If you upload a file, it will replace the pasted HTML below.</small>
          </label>

          <label className="field">
            <span>HTML template</span>
            <textarea
              className="textarea template-code-editor"
              name="html"
              defaultValue={values.html}
              placeholder={
                '<!doctype html>\\n<html>\\n  <body>\\n    {{body_html}}\\n    <a href="{{unsubscribe_url}}">Unsubscribe</a>\\n  </body>\\n</html>'
              }
            />
            <small>
              Required tokens: <code>{"{{body_html}}"}</code> and <code>{"{{unsubscribe_url}}"}</code>.
              Supported tokens include <code>{"{{first_name}}"}</code>, <code>{"{{company}}"}</code>,{" "}
              <code>{"{{sender_name}}"}</code>, <code>{"{{recipient_email}}"}</code>, and{" "}
              <code>{"{{preheader}}"}</code>.
            </small>
            <FieldError name="html" errors={state.fieldErrors} />
          </label>

          <div className="email-template-status-line">
            <span>
              <Upload size={15} aria-hidden="true" /> HTML is sanitized and CSS is inlined before saving.
            </span>
            <SubmitButton />
          </div>
        </form>
      </div>
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button" type="submit" disabled={pending}>
      <Save size={16} aria-hidden="true" /> {pending ? "Checking template..." : "Save template"}
    </button>
  );
}

function FieldError({ name, errors }: { name: string; errors: Record<string, string[] | undefined> }) {
  const messages = errors[name];
  if (!messages?.length) return null;

  return (
    <span className="field-error" role="alert">
      {messages.join(" ")}
    </span>
  );
}
