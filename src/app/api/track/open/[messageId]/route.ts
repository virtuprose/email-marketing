import { EmailEventType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const pixel = Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

type OpenTrackRouteProps = {
  params: Promise<{ messageId: string }>;
};

export async function GET(_request: Request, { params }: OpenTrackRouteProps) {
  const { messageId } = await params;
  const message = await prisma.emailMessage.findUnique({ where: { id: messageId } });

  if (message) {
    await prisma.emailEvent.create({
      data: {
        type: EmailEventType.OPENED,
        messageId,
        campaignId: message.campaignId,
        leadId: message.leadId
      }
    });
  }

  return new NextResponse(pixel, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
