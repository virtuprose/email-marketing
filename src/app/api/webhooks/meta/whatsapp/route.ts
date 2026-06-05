import { NextResponse } from "next/server";
import {
  handleMetaWhatsappWebhook,
  shouldValidateMetaSignatures,
  validateMetaWebhookSignature,
  verifyMetaWebhookChallenge,
  type MetaWhatsappWebhookPayload
} from "@/lib/whatsapp";

export async function GET(request: Request) {
  const challenge = verifyMetaWebhookChallenge(new URL(request.url).searchParams);
  if (!challenge) {
    return NextResponse.json({ error: "Invalid Meta webhook verification." }, { status: 403 });
  }

  return new Response(challenge, { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (
    shouldValidateMetaSignatures() &&
    !validateMetaWebhookSignature({
      rawBody,
      signature: request.headers.get("x-hub-signature-256")
    })
  ) {
    return NextResponse.json({ error: "Invalid Meta webhook signature." }, { status: 401 });
  }

  const payload = JSON.parse(rawBody || "{}") as MetaWhatsappWebhookPayload;
  const result = await handleMetaWhatsappWebhook(payload);
  return NextResponse.json({ ok: true, ...result });
}
