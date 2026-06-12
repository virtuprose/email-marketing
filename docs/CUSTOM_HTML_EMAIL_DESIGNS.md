# Email Design Templates

The platform uses global email design templates as premium visual wrappers around campaign copy.

The template library includes one built-in design and supports adding custom self-contained HTML templates:

- **Virtuprose Signature Premium**
- Table-based email-safe HTML
- Warm off-white canvas, ink text, Virtuprose teal accent
- Premium header, CTA section, service/value block, compliant footer
- No external images, so inboxes do not show broken image placeholders
- Custom templates pasted into the library or uploaded as `.html`

Campaign copy still comes from the campaign sequence. The selected design only wraps the message through `{{body_html}}`.

## Owner Workflow

1. Open `/email-design-templates`.
2. Use **Add email template** to paste HTML or upload a self-contained `.html` file.
3. Make sure the design includes `{{body_html}}` and `{{unsubscribe_url}}`.
4. Save the template. Unsafe HTML is blocked inline and safe templates are sanitized before storage.
5. Preview any saved template in desktop and mobile modal views.
6. Send a test email from the available sending account.
7. Open a campaign detail page.
8. In **Email design**, choose either:
   - **Default branded/plain email**
   - **Virtuprose Signature Premium**
   - Any active custom template you saved
9. Save the design selection.
10. Preview the campaign rendering. The preview uses the campaign's first step and first available recipient sample.
11. Send a campaign test email.
12. Approve and schedule the campaign only after the safety checklist passes.

One selected design applies to the full email sequence, including the initial email and follow-up emails.

## Supported Tokens

Built-in and custom templates support:

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

Every template is validated and sanitized before being saved to the database.

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

Templates with blockers are not saved. Templates with warnings can be saved, but the warnings remain visible in the library so the owner can review them before live sending.

## Development Notes

- The template library route is `/email-design-templates`.
- `EmailDesignTemplate` is global, not campaign-owned.
- `Campaign.selectedEmailDesignTemplateId` points to the selected global template.
- Custom templates use a unique generated slug and `builtIn=false`.
- Old per-campaign uploaded template records are deleted by the migration that introduces the global template library.
- Production leads, replies, campaigns, email messages, and WhatsApp data are not deleted by this migration.
