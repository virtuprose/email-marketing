import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";
import { ingestInboundReply } from "@/lib/replies";

export function imapReplyInboxConfigured() {
  return Boolean(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS);
}

export function emailReplyPollSeconds() {
  const value = Number(process.env.EMAIL_REPLY_POLL_SECONDS || 60);
  if (!Number.isFinite(value) || value < 15) return 60;
  return Math.round(value);
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
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const messages = await client.search({ seen: false });
      if (!messages || !messages.length) return { processed };
      for await (const message of client.fetch(
        messages,
        { uid: true, source: true, envelope: true },
        { uid: true }
      )) {
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const fromEmail = parsed.from?.value?.[0]?.address;
        const toEmail = firstAddress(parsed.to);
        const htmlText = typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ").trim() : "";
        const bodyText = parsed.text?.trim() || htmlText;
        if (!fromEmail || !bodyText) {
          await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
          continue;
        }

        await ingestInboundReply({
          fromEmail,
          toEmail: toEmail || null,
          subject: parsed.subject || "(no subject)",
          bodyText,
          providerMessageId: parsed.messageId || `imap-${message.uid}`,
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
        await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
        processed += 1;
      }
    } finally {
      lock.release();
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
      metadata: { processed }
    }
  });

  return { processed };
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
