# Email Design Templates

The platform uses global email design templates as premium visual wrappers around campaign copy.

V1 ships one fixed built-in template:

- **Virtuprose Signature Premium**
- Table-based email-safe HTML
- Warm off-white canvas, ink text, Virtuprose teal accent
- Premium header, CTA section, service/value block, compliant footer
- No external images, so inboxes do not show broken image placeholders

Campaign copy still comes from the campaign sequence. The selected design only wraps the message through `{{body_html}}`.

## Owner Workflow

1. Open `/email-design-templates`.
2. Preview **Virtuprose Signature Premium** in desktop and mobile modal views.
3. Send a test email from the available sending account.
4. Open a campaign detail page.
5. In **Email design**, choose either:
   - **Default branded/plain email**
   - **Virtuprose Signature Premium**
6. Save the design selection.
7. Preview the campaign rendering. The preview uses the campaign's first step and first available recipient sample.
8. Send a campaign test email.
9. Approve and schedule the campaign only after the safety checklist passes.

One selected design applies to the full email sequence, including the initial email and follow-up emails.

## Supported Tokens

The built-in template supports:

- `{{body_html}}` for rendered campaign step copy
- `{{first_name}}`
- `{{company}}`
- `{{sender_name}}`
- `{{recipient_email}}`
- `{{unsubscribe_url}}`
- `{{preheader}}`

The campaign step body remains plain text in the editor. At send time, the platform renders that copy, injects it into `{{body_html}}`, and stores the final `bodyHtml` snapshot on queued email messages.

## Sending Behavior

- If no template is selected, the existing default branded email wrapper is used.
- If **Virtuprose Signature Premium** is selected, no extra wrapper is added on top.
- Plain-text fallback always stays as the campaign copy.
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers remain active when an unsubscribe URL is present.
- Suppression, unsubscribe, sender identity, safety checks, throttling, and approval gates remain mandatory.
- Queued campaign messages store the selected `emailDesignTemplateId` for audit.

## Template Safety

The built-in template is validated and sanitized before being saved to the database.

The platform blocks unsafe HTML patterns:

- Missing `{{body_html}}`
- Missing unsubscribe token or visible unsubscribe wording
- JavaScript, external scripts, event handlers, iframes, embeds, forms, and form fields
- HTML over 200 KB

The platform warns for common email-client risks:

- Missing `{{preheader}}`
- HTML over 100 KB
- Non-HTTPS images
- Images without alt text
- Too many images
- CSS features with weak inbox support, such as grid, flex, filters, fixed positioning, or absolute positioning

Original HTML is stored for audit. Only sanitized and CSS-inlined HTML is used for previews, test sends, and campaign sends.

## Development Notes

- The template library route is `/email-design-templates`.
- `EmailDesignTemplate` is global, not campaign-owned.
- `Campaign.selectedEmailDesignTemplateId` points to the selected global template.
- Old per-campaign uploaded template records are deleted by the migration that introduces the global template library.
- Production leads, replies, campaigns, email messages, and WhatsApp data are not deleted by this migration.
