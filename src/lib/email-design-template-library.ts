import type { EmailDesignTemplate, Lead, Prisma } from "@prisma/client";
import {
  BUILT_IN_EMAIL_DESIGN_DESCRIPTION,
  BUILT_IN_EMAIL_DESIGN_NAME,
  BUILT_IN_EMAIL_DESIGN_SLUG,
  VIRTUPROSE_SIGNATURE_PREMIUM_HTML,
  prepareEmailDesignHtml,
  renderCustomEmailHtml,
  renderTextBodyAsHtml
} from "@/lib/email-designs";
import { prisma } from "@/lib/prisma";

export const EMAIL_DESIGN_SAMPLE_LEAD: Pick<Lead, "firstName" | "company" | "email" | "website"> = {
  firstName: "Sara",
  company: "Growth Studio",
  email: "sara@example.com",
  website: "https://growthstudio.example"
};

export const EMAIL_DESIGN_SAMPLE_SUBJECT = "A practical automation idea for {{company}}";
export const EMAIL_DESIGN_SAMPLE_BODY = [
  "Hi {{first_name}},",
  "",
  "I’m reaching out from Virtuprose because we help companies like {{company}} reduce repetitive manual work using automation and AI-assisted workflows.",
  "",
  "If there is one process you want to improve this month, I can arrange a quick call with our team.",
  "",
  "Best regards,",
  "{{sender_name}}",
  "",
  "To opt out, click here: {{unsubscribe_url}}"
].join("\n");

export type EmailDesignTemplateRenderInput = {
  template: Pick<EmailDesignTemplate, "sanitizedHtml">;
  subject: string;
  body: string;
  lead?: Pick<Lead, "firstName" | "company" | "email" | "website"> | null;
  senderName: string;
  unsubscribeUrl: string;
  personalization?: unknown;
  preheader?: string;
};

export async function ensureBuiltInEmailDesignTemplate(
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const prepared = prepareEmailDesignHtml(VIRTUPROSE_SIGNATURE_PREMIUM_HTML);

  return tx.emailDesignTemplate.upsert({
    where: { slug: BUILT_IN_EMAIL_DESIGN_SLUG },
    update: {
      name: BUILT_IN_EMAIL_DESIGN_NAME,
      description: BUILT_IN_EMAIL_DESIGN_DESCRIPTION,
      originalHtml: VIRTUPROSE_SIGNATURE_PREMIUM_HTML,
      sanitizedHtml: prepared.sanitizedHtml,
      status: prepared.status,
      warnings: prepared.warnings,
      errors: prepared.errors,
      active: true,
      builtIn: true
    },
    create: {
      slug: BUILT_IN_EMAIL_DESIGN_SLUG,
      name: BUILT_IN_EMAIL_DESIGN_NAME,
      description: BUILT_IN_EMAIL_DESIGN_DESCRIPTION,
      originalHtml: VIRTUPROSE_SIGNATURE_PREMIUM_HTML,
      sanitizedHtml: prepared.sanitizedHtml,
      status: prepared.status,
      warnings: prepared.warnings,
      errors: prepared.errors,
      active: true,
      builtIn: true
    }
  });
}

export async function getActiveEmailDesignTemplates() {
  await ensureBuiltInEmailDesignTemplate();

  return prisma.emailDesignTemplate.findMany({
    where: { active: true },
    orderBy: [{ builtIn: "desc" }, { name: "asc" }]
  });
}

export function renderEmailDesignTemplateHtml(input: EmailDesignTemplateRenderInput) {
  const lead = input.lead ?? EMAIL_DESIGN_SAMPLE_LEAD;
  const rendered = renderCampaignCopyForTemplate({
    subject: input.subject,
    body: input.body,
    lead,
    senderName: input.senderName,
    unsubscribeUrl: input.unsubscribeUrl,
    personalization: input.personalization
  });

  return {
    subject: rendered.subject,
    bodyText: rendered.bodyText,
    bodyHtml: renderCustomEmailHtml({
      designHtml: input.template.sanitizedHtml,
      account: { fromName: input.senderName },
      subject: rendered.subject,
      text: rendered.bodyText,
      lead,
      unsubscribeUrl: input.unsubscribeUrl,
      preheader: input.preheader
    })
  };
}

export function renderPlainEmailPreviewHtml({
  subject,
  body,
  lead,
  senderName,
  unsubscribeUrl,
  personalization
}: Omit<EmailDesignTemplateRenderInput, "template" | "preheader">) {
  const rendered = renderCampaignCopyForTemplate({
    subject,
    body,
    lead: lead ?? EMAIL_DESIGN_SAMPLE_LEAD,
    senderName,
    unsubscribeUrl,
    personalization
  });

  return {
    subject: rendered.subject,
    bodyText: rendered.bodyText,
    bodyHtml: [
      '<!doctype html><html><body style="margin:0;background:#f7f1e8;font-family:Arial,Helvetica,sans-serif;color:#102225;">',
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7f1e8;padding:24px 12px;"><tr><td align="center">',
      '<table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;width:100%;background:#fffaf0;border:1px solid #e1d6c5;border-radius:20px;"><tr><td style="padding:28px;">',
      `<h1 style="margin:0 0 18px;color:#102225;font-size:22px;line-height:1.25;">${escapeHtml(rendered.subject)}</h1>`,
      renderTextBodyAsHtml(rendered.bodyText),
      "</td></tr></table></td></tr></table></body></html>"
    ].join("")
  };
}

function renderCampaignCopyForTemplate({
  subject,
  body,
  lead,
  senderName,
  unsubscribeUrl,
  personalization
}: {
  subject: string;
  body: string;
  lead: Pick<Lead, "firstName" | "company" | "email" | "website">;
  senderName: string;
  unsubscribeUrl: string;
  personalization?: unknown;
}) {
  const replacements: Record<string, string> = {
    "{{first_name}}": lead.firstName || "there",
    "{{company}}": lead.company || "your company",
    "{{website}}": lead.website || "their website",
    "{{sender_name}}": senderName,
    "{{recipient_email}}": lead.email,
    "{{unsubscribe_url}}": unsubscribeUrl,
    ...personalizationReplacements(personalization)
  };

  let renderedSubject = subject;
  let renderedBody = body;
  for (const [token, value] of Object.entries(replacements)) {
    renderedSubject = renderedSubject.replaceAll(token, value);
    renderedBody = renderedBody.replaceAll(token, value);
  }

  return {
    subject: renderedSubject,
    bodyText: renderedBody
  };
}

function personalizationReplacements(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const allowed = [
    "audit_pain_point",
    "audit_evidence",
    "recommended_improvement",
    "mobile_app_signal",
    "service_name",
    "audit_email_subject",
    "audit_email_body"
  ];
  const replacements: Record<string, string> = {};
  for (const key of allowed) {
    replacements[`{{${key}}}`] = String(record[key] ?? "").trim();
  }
  return replacements;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
