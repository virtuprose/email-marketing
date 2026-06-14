import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";
import { ingestInboundReply, isSystemOrMarketingReply } from "@/lib/replies";

export function imapReplyInboxConfigured() {
  return Boolean(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS);
}

export function emailReplyPollSeconds() {
  const value = Number(process.env.EMAIL_REPLY_POLL_SECONDS || 60);
  if (!Number.isFinite(value) || value < 15) return 60;
  return Math.round(value);
}

export function emailReplyLookbackHours() {
  const value = Number(process.env.EMAIL_REPLY_LOOKBACK_HOURS || 36);
  if (!Number.isFinite(value) || value < 1) return 36;
  return Math.min(Math.round(value), 168);
}

export async function pollEmailRepliesOnce() {
  if (!imapReplyInboxConfigured()) {
    return { skipped: true, reason: "imap_not_configured" };
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: Number(process.env.IMAP_PORT || 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: {
      user: process.env.IMAP_USER!,
      pass: process.env.IMAP_PASS!
    },
    logger: false
  });

  let processed = 0;
  let duplicates = 0;
  let skipped = 0;
  const candidates: Array<Parameters<typeof ingestInboundReply>[0]> = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - emailReplyLookbackHours() * 60 * 60 * 1000);
      const unseenUids = await client.search({ seen: false }, { uid: true });
      const recentUids = await client.search({ since }, { uid: true });
      const messages = [...new Set([...searchResultUids(unseenUids), ...searchResultUids(recentUids)])].sort(
        (a, b) => a - b
      );
      if (!messages.length) return { processed, duplicates, skipped };
      for await (const message of client.fetch(
        messages,
        { uid: true, source: true, flags: true },
        { uid: true }
      )) {
        const wasUnread = !Array.from(message.flags || []).includes("\\Seen");
        if (!message.source) {
          skipped += 1;
          continue;
        }
        const parsed = await simpleParser(message.source);
        const fromEmail = parsed.from?.value?.[0]?.address;
        const toEmail = firstAddress(parsed.to);
        const htmlText = typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ").trim() : "";
        const bodyText = parsed.text?.trim() || htmlText;
        if (!wasUnread && !looksLikeReply(parsed.subject, parsed.inReplyTo, parsed.references)) {
          skipped += 1;
          continue;
        }
        const skipReason = replySkipReason({
          fromEmail,
          subject: parsed.subject,
          bodyText,
          headers: parsed.headers
        });
        if (skipReason) {
          skipped += 1;
          continue;
        }

        if (!fromEmail || !bodyText) {
          skipped += 1;
          continue;
        }

        candidates.push({
          fromEmail,
          toEmail: toEmail || null,
          subject: parsed.subject || "(no subject)",
          bodyText,
          providerMessageId: parsed.messageId || `imap:${process.env.IMAP_USER}:${message.uid}`,
          messageIdHeader: parsed.messageId || null,
          inReplyTo: parsed.inReplyTo || null,
          source: "imap",
          raw: {
            uid: message.uid,
            date: parsed.date?.toISOString(),
            from: parsed.from?.text,
            to: addressText(parsed.to),
            messageId: parsed.messageId
          }
        });
      }
    } finally {
      lock.release();
    }

    for (const candidate of candidates) {
      const result = await ingestInboundReply(candidate);
      if (result.duplicate) {
        duplicates += 1;
      } else {
        processed += 1;
      }
    }
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        action: "email_reply.imap_poll_failed",
        entityType: "email_inbox",
        metadata: { error: error instanceof Error ? error.message : "Unknown IMAP error" }
      }
    });
    throw error;
  } finally {
    await client.logout().catch(() => undefined);
  }

  await prisma.auditLog.create({
    data: {
      action: "email_reply.imap_poll_processed",
      entityType: "email_inbox",
      metadata: { processed, duplicates, skipped, lookbackHours: emailReplyLookbackHours() }
    }
  });

  return { processed, duplicates, skipped };
}

function searchResultUids(result: false | number[]) {
  return Array.isArray(result) ? result : [];
}

function looksLikeReply(
  subject?: string,
  inReplyTo?: string | false,
  references?: string[] | string | false
) {
  if (inReplyTo) return true;
  if (Array.isArray(references) ? references.length > 0 : Boolean(references)) return true;
  return /^(re|fw|fwd)\s*:/i.test((subject || "").trim());
}

export function replySkipReason({
  fromEmail,
  subject,
  bodyText,
  headers
}: {
  fromEmail?: string;
  subject?: string;
  bodyText: string;
  headers: Map<string, unknown>;
}) {
  if (!fromEmail || !bodyText) return "missing_sender_or_body";

  const normalizedFrom = fromEmail.trim().toLowerCase();
  const inboxUser = process.env.IMAP_USER?.trim().toLowerCase();
  if (inboxUser && normalizedFrom === inboxUser) return "self_sent_message";
  const inboxDomain = inboxUser?.split("@")[1];
  if (inboxDomain && normalizedFrom.endsWith(`@${inboxDomain}`)) return "internal_domain_message";

  const localPart = normalizedFrom.split("@")[0] || "";
  if (
    ["mailer-daemon", "postmaster", "bounce", "notification", "notifications"].includes(localPart) ||
    localPart === "no-reply" ||
    localPart === "noreply" ||
    localPart.startsWith("no-reply+") ||
    localPart.startsWith("noreply+")
  ) {
    return "automated_sender";
  }

  const normalizedSubject = (subject || "").trim().toLowerCase();
  if (
    normalizedSubject.includes("undelivered mail returned to sender") ||
    normalizedSubject.includes("delivery status notification") ||
    normalizedSubject.includes("mail delivery failed")
  ) {
    return "delivery_status_message";
  }

  const autoSubmitted = String(headers.get("auto-submitted") || "")
    .trim()
    .toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return "auto_submitted_message";

  const precedence = String(headers.get("precedence") || "")
    .trim()
    .toLowerCase();
  if (["bulk", "junk", "list"].includes(precedence)) return "bulk_or_list_message";

  if (hasAnyHeader(headers, ["list-unsubscribe", "list-id", "feedback-id", "x-campaign-id"])) {
    return "bulk_or_list_message";
  }

  const xMailer = String(headers.get("x-mailer") || "").toLowerCase();
  if (matchesAny(xMailer, ["mailchimp", "sendgrid", "customer.io", "mailjet", "hubspot", "marketo"])) {
    return "bulk_or_list_message";
  }

  const normalizedBody = bodyText.replace(/\s+/g, " ").trim().toLowerCase();
  if (isSystemOrMarketingReply({ fromEmail, subject: normalizedSubject, bodyText: normalizedBody })) {
    return "system_or_marketing_message";
  }

  return null;
}

function hasAnyHeader(headers: Map<string, unknown>, names: string[]) {
  return names.some((name) => Boolean(headers.get(name)));
}

function matchesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function firstAddress(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) return firstAddress(value[0]);
  const record = value as { value?: Array<{ address?: string }> };
  return record.value?.[0]?.address;
}

function addressText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) return value.map(addressText).filter(Boolean).join(", ");
  const record = value as { text?: string };
  return record.text;
}
