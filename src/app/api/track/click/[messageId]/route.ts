import { EmailEventType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ClickTrackRouteProps = {
  params: Promise<{ messageId: string }>;
};

export async function GET(request: Request, { params }: ClickTrackRouteProps) {
  const { messageId } = await params;
  const url = new URL(request.url);
  const target = url.searchParams.get("url") || "https://virtuprose.com";
  const safeTarget = isSafeRedirect(target) ? target : "https://virtuprose.com";
  const message = await prisma.emailMessage.findUnique({ where: { id: messageId } });

  if (message) {
    await prisma.emailEvent.create({
      data: {
        type: EmailEventType.CLICKED,
        messageId,
        campaignId: message.campaignId,
        leadId: message.leadId,
        metadata: { target: safeTarget }
      }
    });
  }

  return NextResponse.redirect(safeTarget);
}

function isSafeRedirect(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
