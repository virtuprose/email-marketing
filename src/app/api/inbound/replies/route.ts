import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ingestInboundReply } from "@/lib/replies";

const inboundReplyPayloadSchema = z.object({
  fromEmail: z.string().email().optional(),
  from: z.string().email().optional(),
  toEmail: z.string().email().optional(),
  to: z.string().email().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  text: z.string().optional(),
  providerMessageId: z.string().optional(),
  messageIdHeader: z.string().optional(),
  messageId: z.string().optional(),
  inReplyTo: z.string().optional(),
  source: z.string().optional()
});

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "INBOUND_WEBHOOK_SECRET is not configured." },
      { status: 503 }
    );
  }

  const receivedSecret = request.headers.get("x-inbound-secret");
  if (receivedSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Invalid inbound secret." }, { status: 401 });
  }

  const raw = (await request.json()) as unknown;
  const parsed = inboundReplyPayloadSchema.parse(raw);
  const fromEmail = parsed.fromEmail || parsed.from;
  const bodyText = parsed.bodyText || parsed.text;

  if (!fromEmail || !bodyText) {
    return NextResponse.json(
      { ok: false, error: "fromEmail/from and bodyText/text are required." },
      { status: 400 }
    );
  }

  const result = await ingestInboundReply({
    fromEmail,
    toEmail: parsed.toEmail || parsed.to || null,
    subject: parsed.subject || "(no subject)",
    bodyText,
    providerMessageId: parsed.providerMessageId || parsed.messageId || null,
    messageIdHeader: parsed.messageIdHeader || parsed.messageId || null,
    inReplyTo: parsed.inReplyTo || null,
    source: parsed.source || "webhook",
    raw: raw as never
  });

  return NextResponse.json({
    ok: true,
    duplicate: result.duplicate,
    replyId: result.reply.id
  });
}
