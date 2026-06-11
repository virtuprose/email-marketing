import { EmailDesignValidationStatus, type Lead, type SendingAccount } from "@prisma/client";
import juice from "juice";
import sanitizeHtml from "sanitize-html";

export const MAX_EMAIL_DESIGNS_PER_CAMPAIGN = 3;
export const MAX_EMAIL_DESIGN_BYTES = 200_000;

const REQUIRED_BODY_TOKEN = "{{body_html}}";
const UNSUBSCRIBE_TOKEN = "{{unsubscribe_url}}";

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
