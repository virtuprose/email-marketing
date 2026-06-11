# Custom HTML Email Designs

Use custom HTML designs when you want a premium branded email wrapper around the campaign copy generated inside the platform.

## What To Upload

- Upload up to 3 self-contained `.html` files per email campaign.
- Each file must include `{{body_html}}`. The platform injects the campaign step copy there.
- Include `{{unsubscribe_url}}` in a visible unsubscribe link.
- Optional supported tokens: `{{first_name}}`, `{{company}}`, `{{sender_name}}`, and `{{preheader}}`.
- Use table-based, email-safe HTML with inline or simple embedded CSS.
- Use HTTPS image URLs or the existing CID logo pattern. Avoid relative image paths.

## Recommended Template Shape

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @media only screen and (max-width: 620px) {
        .shell {
          width: 100% !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;background:#f5f7f7;">
    <div style="display:none;max-height:0;overflow:hidden;">{{preheader}}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table class="shell" role="presentation" width="600" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <h1>Hi {{first_name}}</h1>
                {{body_html}}
                <p><a href="https://virtuprose.com">Book a quick call</a></p>
                <p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Owner Workflow

1. Open the campaign detail page.
2. Go to the **Email design** panel.
3. Upload up to 3 `.html` files.
4. Review validation results and desktop/mobile previews.
5. Select one valid design.
6. Send a test email before approving or scheduling the campaign.
7. If no custom design is selected, the platform uses the default branded wrapper.

## Validation Rules

The platform blocks unsafe or broken designs:

- Missing `{{body_html}}`
- Missing unsubscribe token or visible unsubscribe link
- JavaScript, external scripts, event handlers, iframes, embeds, and forms
- Files over 200 KB

The platform warns, but does not block, for common email-client risks:

- Missing `{{preheader}}`
- Large HTML over 100 KB
- Non-HTTPS images
- Images without alt text
- Too many images
- CSS features with weak inbox support, such as grid, flex, filters, fixed positioning, or absolute positioning

Original HTML is stored for audit. Only sanitized and CSS-inlined HTML is used for previews, test sends, and campaign sends.
