import { EmailDesignValidationStatus, type Lead, type SendingAccount } from "@prisma/client";
import juice from "juice";
import sanitizeHtml from "sanitize-html";

export const MAX_EMAIL_DESIGN_BYTES = 200_000;
export const BUILT_IN_EMAIL_DESIGN_SLUG = "virtuprose-signature-premium";
export const BUILT_IN_EMAIL_DESIGN_NAME = "Virtuprose Signature Premium";
export const BUILT_IN_EMAIL_DESIGN_DESCRIPTION =
  "A premium Virtuprose email-safe template with warm canvas, teal accents, clear CTA, service value block, and compliant footer.";

const REQUIRED_BODY_TOKEN = "{{body_html}}";
const UNSUBSCRIBE_TOKEN = "{{unsubscribe_url}}";

export const VIRTUPROSE_SIGNATURE_PREMIUM_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{preheader}}</title>
    <style>
      @media only screen and (max-width: 640px) {
        .vp-shell { width: 100% !important; }
        .vp-pad { padding: 24px 18px !important; }
        .vp-hero-title { font-size: 28px !important; line-height: 1.12 !important; }
        .vp-stack { display: block !important; width: 100% !important; }
        .vp-service { padding-bottom: 12px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f7f1e8;font-family:Arial,Helvetica,sans-serif;color:#101b1d;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{{preheader}}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f1e8;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:34px 12px;">
          <table role="presentation" class="vp-shell" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;background:#fffaf0;border:1px solid #e1d6c5;border-radius:24px;overflow:hidden;">
            <tr>
              <td class="vp-pad" style="padding:30px 34px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td align="center" style="width:42px;height:42px;background:#062224;border-radius:14px;color:#2dd4da;font-size:24px;font-weight:800;line-height:42px;">V</td>
                          <td style="padding-left:12px;">
                            <div style="font-size:17px;line-height:1.2;font-weight:800;color:#101b1d;">Virtuprose</div>
                            <div style="font-size:12px;line-height:1.4;color:#706a61;">AI sales and automation studio</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td align="right" style="vertical-align:middle;color:#087b7f;font-size:12px;font-weight:700;">Premium outreach</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="vp-pad" style="padding:10px 34px 26px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#102225;border-radius:22px;">
                  <tr>
                    <td style="padding:28px 28px 30px;">
                      <div style="font-size:13px;line-height:1.4;color:#80f0ee;font-weight:700;">Built for practical growth</div>
                      <h1 class="vp-hero-title" style="margin:10px 0 12px;color:#ffffff;font-size:34px;line-height:1.08;font-weight:800;">A clearer way to reduce manual work at {{company}}</h1>
                      <p style="margin:0;color:#d6ece8;font-size:15px;line-height:1.65;">A short note from {{sender_name}} about using automation and AI-assisted workflows to improve follow-ups, operations, reporting, and customer communication.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="vp-pad" style="padding:0 34px 14px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid #eadfce;border-radius:20px;">
                  <tr>
                    <td style="padding:26px 28px;">
                      {{body_html}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="vp-pad" style="padding:8px 34px 22px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td class="vp-stack vp-service" width="33.33%" style="vertical-align:top;padding-right:10px;">
                      <div style="border:1px solid #eadfce;border-radius:18px;background:#fffdf8;padding:16px;">
                        <div style="color:#087b7f;font-size:12px;font-weight:800;">01</div>
                        <div style="margin-top:8px;color:#101b1d;font-size:15px;line-height:1.35;font-weight:800;">Workflow clarity</div>
                        <div style="margin-top:7px;color:#706a61;font-size:13px;line-height:1.5;">Map slow manual steps and turn them into simple operating flows.</div>
                      </div>
                    </td>
                    <td class="vp-stack vp-service" width="33.33%" style="vertical-align:top;padding-right:10px;">
                      <div style="border:1px solid #eadfce;border-radius:18px;background:#fffdf8;padding:16px;">
                        <div style="color:#087b7f;font-size:12px;font-weight:800;">02</div>
                        <div style="margin-top:8px;color:#101b1d;font-size:15px;line-height:1.35;font-weight:800;">AI-assisted sales</div>
                        <div style="margin-top:7px;color:#706a61;font-size:13px;line-height:1.5;">Reply faster, qualify enquiries, and move serious leads to meetings.</div>
                      </div>
                    </td>
                    <td class="vp-stack" width="33.33%" style="vertical-align:top;">
                      <div style="border:1px solid #eadfce;border-radius:18px;background:#fffdf8;padding:16px;">
                        <div style="color:#087b7f;font-size:12px;font-weight:800;">03</div>
                        <div style="margin-top:8px;color:#101b1d;font-size:15px;line-height:1.35;font-weight:800;">Clean delivery</div>
                        <div style="margin-top:7px;color:#706a61;font-size:13px;line-height:1.5;">Ship useful automation without overcomplicating your team workflow.</div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="vp-pad" style="padding:0 34px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#e8fbf8;border:1px solid #bfe9e4;border-radius:20px;">
                  <tr>
                    <td class="vp-stack" style="padding:20px 22px;vertical-align:middle;">
                      <div style="color:#102225;font-size:16px;line-height:1.4;font-weight:800;">Want us to review the best automation opportunity?</div>
                      <div style="margin-top:5px;color:#52615f;font-size:13px;line-height:1.55;">Reply with one process you want improved, or book a short conversation with the Virtuprose team.</div>
                    </td>
                    <td class="vp-stack" align="right" style="padding:20px 22px;vertical-align:middle;">
                      <a href="https://virtuprose.com" style="display:inline-block;background:#087b7f;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:800;">Book a quick call</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="background:#f1eadf;padding:22px 34px;">
                <p style="margin:0 0 8px;color:#706a61;font-size:12px;line-height:1.6;">Sent to {{recipient_email}} by {{sender_name}} from Virtuprose.</p>
                <p style="margin:0;color:#706a61;font-size:12px;line-height:1.6;">You can opt out anytime: <a href="{{unsubscribe_url}}" style="color:#087b7f;text-decoration:underline;">unsubscribe here</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const blockedPatterns: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /<script\b/i, message: "Remove script tags. Email clients block scripts." },
  { pattern: /\son[a-z]+\s*=/i, message: "Remove inline event handlers like onclick or onload." },
  { pattern: /href\s*=\s*["']?\s*javascript:/i, message: "Remove javascript: links." },
  { pattern: /<form\b/i, message: "Remove forms. Use a normal reply or CTA link instead." },
  { pattern: /<(iframe|object|embed)\b/i, message: "Remove embedded frames or objects." },
  { pattern: /<input\b|<select\b|<textarea\b/i, message: "Remove form fields from the email design." },
  { pattern: /expression\s*\(/i, message: "Remove CSS expressions." },
  { pattern: /url\s*\(\s*["']?\s*javascript:/i, message: "Remove JavaScript CSS URLs." }
];

export type PreparedEmailDesign = {
  sanitizedHtml: string;
  status: EmailDesignValidationStatus;
  warnings: string[];
  errors: string[];
};

export type EmailDesignRenderInput = {
  designHtml: string;
  account: Pick<SendingAccount, "fromName">;
  subject: string;
  text: string;
  lead: Pick<Lead, "firstName" | "company" | "email">;
  unsubscribeUrl: string;
  preheader?: string;
};

export function prepareEmailDesignHtml(html: string): PreparedEmailDesign {
  const source = html.trim();
  const errors = validationErrors(source);
  const warnings = validationWarnings(source);
  const inlined = inlineEmailCss(source);
  const sanitizedHtml = sanitizeEmailHtml(inlined);

  return {
    sanitizedHtml,
    status: errors.length ? EmailDesignValidationStatus.BLOCKED : EmailDesignValidationStatus.VALID,
    warnings,
    errors
  };
}

export function renderCustomEmailHtml(input: EmailDesignRenderInput) {
  const bodyHtml = renderTextBodyAsHtml(input.text);
  const replacements: Record<string, string> = {
    "{{first_name}}": escapeHtml(input.lead.firstName || "there"),
    "{{company}}": escapeHtml(input.lead.company || "your company"),
    "{{sender_name}}": escapeHtml(input.account.fromName),
    "{{recipient_email}}": escapeHtml(input.lead.email),
    "{{unsubscribe_url}}": escapeHtml(input.unsubscribeUrl),
    "{{preheader}}": escapeHtml(input.preheader || input.subject),
    "{{body_html}}": bodyHtml
  };

  let rendered = input.designHtml;
  for (const [token, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(token, value);
  }

  return rendered;
}

export function renderTextBodyAsHtml(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;color:#102225;font-size:15px;line-height:1.6;">${linkify(
          escapeHtml(paragraph)
        ).replace(/\n/g, "<br>")}</p>`
    );

  return paragraphs.join("");
}

export function validationErrors(html: string) {
  const errors = new Set<string>();

  if (!html.trim()) errors.add("Upload a non-empty HTML file.");
  if (Buffer.byteLength(html, "utf8") > MAX_EMAIL_DESIGN_BYTES) {
    errors.add("HTML file is too large. Keep it under 200 KB.");
  }
  if (!html.includes(REQUIRED_BODY_TOKEN)) {
    errors.add("Add {{body_html}} where the campaign message should appear.");
  }
  if (!html.includes(UNSUBSCRIBE_TOKEN) && !/unsubscribe/i.test(html)) {
    errors.add("Add {{unsubscribe_url}} or a clear unsubscribe link.");
  }

  for (const item of blockedPatterns) {
    if (item.pattern.test(html)) errors.add(item.message);
  }

  return [...errors];
}

export function validationWarnings(html: string) {
  const warnings = new Set<string>();
  const bytes = Buffer.byteLength(html, "utf8");

  if (bytes > 100_000) warnings.add("HTML is over 100 KB. Some inboxes may clip long emails.");
  if (!html.includes("{{preheader}}")) warnings.add("Add {{preheader}} for cleaner inbox preview text.");
  if (/<button\b/i.test(html)) warnings.add("Use an <a> link styled as a button instead of <button>.");
  if (/position\s*:\s*(fixed|absolute)/i.test(html))
    warnings.add("Avoid fixed or absolute positioning in email.");
  if (/display\s*:\s*(grid|flex)/i.test(html))
    warnings.add("Grid/flex layouts are not reliable in all inboxes.");
  if (/filter\s*:|backdrop-filter\s*:/i.test(html))
    warnings.add("CSS filters are not reliable in email clients.");

  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  if (imageTags.length > 12)
    warnings.add("This design has many images. Heavy emails can hurt deliverability.");

  for (const image of imageTags) {
    if (!/\salt\s*=/i.test(image)) warnings.add("Add alt text to every image.");
    const src = image.match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    if (src && !src.startsWith("https://") && !src.startsWith("cid:")) {
      warnings.add("Use HTTPS image URLs or the existing CID logo. Avoid relative, HTTP, or data images.");
    }
  }

  return [...warnings];
}

function inlineEmailCss(html: string) {
  return juice(html, {
    applyAttributesTableElements: true,
    applyHeightAttributes: true,
    applyStyleTags: true,
    applyWidthAttributes: true,
    preserveMediaQueries: true,
    preserveFontFaces: true,
    removeStyleTags: false
  });
}

function sanitizeEmailHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "html",
      "head",
      "body",
      "meta",
      "title",
      "style",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "div",
      "span",
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "a",
      "img",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "center",
      "small"
    ],
    allowedAttributes: {
      "*": [
        "align",
        "aria-label",
        "bgcolor",
        "border",
        "cellpadding",
        "cellspacing",
        "class",
        "dir",
        "height",
        "id",
        "lang",
        "role",
        "style",
        "title",
        "valign",
        "width"
      ],
      a: ["href", "name", "target", "rel", "style", "class", "id", "title"],
      img: ["src", "alt", "width", "height", "style", "class", "id", "border"],
      meta: ["name", "content", "charset", "http-equiv", "viewport"],
      table: ["role", "width", "cellspacing", "cellpadding", "border", "align", "style", "class", "id"],
      td: ["width", "height", "align", "valign", "bgcolor", "style", "class", "id", "colspan", "rowspan"],
      th: ["width", "height", "align", "valign", "bgcolor", "style", "class", "id", "colspan", "rowspan"]
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "cid", "data"],
    allowProtocolRelative: false,
    allowVulnerableTags: true,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }, true)
    }
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function linkify(value: string) {
  return value.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const cleanUrl = url.replace(/[),.;]+$/, "");
    const suffix = url.slice(cleanUrl.length);
    return `<a href="${cleanUrl}" style="color:#00aeb7;text-decoration:underline;">${cleanUrl}</a>${suffix}`;
  });
}
