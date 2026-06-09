import { MessageChannel, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestGenericInboundConversation } from "@/lib/replies";

const inboundConversationPayloadSchema = z.object({
  channel: z.enum([MessageChannel.WEBSITE_CHAT, MessageChannel.INSTAGRAM]),
  externalContactId: z.string().optional(),
  fromEmail: z.string().email().optional(),
  fromPhoneE164: z.string().optional(),
  name: z.string().optional(),
  company: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().min(1),
  providerMessageId: z.string().optional(),
  source: z.string().optional(),
  raw: z.unknown().optional()
});

export async function POST(request: Request) {
  const expectedSecret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "INBOUND_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const receivedSecret = request.headers.get("x-inbound-secret");
  if (receivedSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Invalid inbound secret." }, { status: 401 });
  }

  const raw = (await request.json()) as unknown;
  const parsed = inboundConversationPayloadSchema.parse(raw);
  const result = await ingestGenericInboundConversation({
    ...parsed,
    raw: (parsed.raw ?? raw) as Prisma.InputJsonValue
  });

  return NextResponse.json({
    ok: true,
    duplicate: result.duplicate,
    replyId: result.reply.id,
    leadId: result.reply.leadId,
    status: result.reply.status,
    intent: result.reply.intent,
    aiConfidence: result.reply.aiConfidence
  });
}
