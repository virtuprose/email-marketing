import { Worker } from "bullmq";
import { processQueuedAiReply } from "@/lib/ai-assistant";
import { emailReplyPollSeconds, imapReplyInboxConfigured, pollEmailRepliesOnce } from "@/lib/email-inbox";
import { prisma } from "@/lib/prisma";
import {
  AI_REPLY_QUEUE_NAME,
  EMAIL_QUEUE_NAME,
  FOUNDATION_QUEUE_NAME,
  WHATSAPP_QUEUE_NAME,
  redisConnection,
  type AiReplyJobData,
  type EmailSendJobData,
  type FoundationJobData,
  type WhatsappSendJobData
} from "@/lib/queue";
import { sendAiReplyDraft } from "@/lib/replies";
import { processEmailMessage } from "@/lib/sending";
import { processWhatsappMessage } from "@/lib/whatsapp";

const worker = new Worker<FoundationJobData>(
  FOUNDATION_QUEUE_NAME,
  async (job) => {
    if (job.name !== "phase0.smoke") {
      throw new Error(`Unsupported foundation job: ${job.name}`);
    }

    await prisma.auditLog.create({
      data: {
        action: "worker.phase0_smoke",
        entityType: "worker_job",
        entityId: String(job.id),
        metadata: {
          message: job.data.message,
          requestedAt: job.data.requestedAt
        }
      }
    });

    return {
      ok: true,
      processedAt: new Date().toISOString()
    };
  },
  {
    connection: redisConnection()
  }
);

const emailWorker = new Worker<EmailSendJobData>(
  EMAIL_QUEUE_NAME,
  async (job) => {
    if (job.name !== "email.send") {
      throw new Error(`Unsupported email job: ${job.name}`);
    }

    return processEmailMessage(job.data.messageId);
  },
  {
    connection: redisConnection(),
    concurrency: 1
  }
);

const whatsappWorker = new Worker<WhatsappSendJobData>(
  WHATSAPP_QUEUE_NAME,
  async (job) => {
    if (job.name !== "whatsapp.send") {
      throw new Error(`Unsupported WhatsApp job: ${job.name}`);
    }

    return processWhatsappMessage(job.data.messageId);
  },
  {
    connection: redisConnection(),
    concurrency: 1
  }
);

const aiReplyWorker = new Worker<AiReplyJobData>(
  AI_REPLY_QUEUE_NAME,
  async (job) => {
    if (job.name !== "ai.reply.send") {
      throw new Error(`Unsupported AI reply job: ${job.name}`);
    }

    return processQueuedAiReply(job.data.draftId, sendAiReplyDraft);
  },
  {
    connection: redisConnection(),
    concurrency: 1
  }
);

let imapPoller: NodeJS.Timeout | null = null;
if (imapReplyInboxConfigured()) {
  const intervalMs = emailReplyPollSeconds() * 1000;
  imapPoller = setInterval(() => {
    pollEmailRepliesOnce().catch((error) => {
      console.error("Email reply polling failed:", error);
    });
  }, intervalMs);
  pollEmailRepliesOnce().catch((error) => {
    console.error("Email reply polling failed:", error);
  });
}

worker.on("ready", () => {
  console.log(`Worker ready on queue "${FOUNDATION_QUEUE_NAME}"`);
});

emailWorker.on("ready", () => {
  console.log(`Worker ready on queue "${EMAIL_QUEUE_NAME}"`);
});

whatsappWorker.on("ready", () => {
  console.log(`Worker ready on queue "${WHATSAPP_QUEUE_NAME}"`);
});

aiReplyWorker.on("ready", () => {
  console.log(`Worker ready on queue "${AI_REPLY_QUEUE_NAME}"`);
});

worker.on("completed", (job) => {
  console.log(`Completed job ${job.name}#${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Failed job ${job?.name ?? "unknown"}#${job?.id ?? "unknown"}:`, error);
});

process.on("SIGINT", async () => {
  if (imapPoller) clearInterval(imapPoller);
  await worker.close();
  await emailWorker.close();
  await whatsappWorker.close();
  await aiReplyWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (imapPoller) clearInterval(imapPoller);
  await worker.close();
  await emailWorker.close();
  await whatsappWorker.close();
  await aiReplyWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});
