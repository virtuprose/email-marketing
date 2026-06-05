import { Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import {
  EMAIL_QUEUE_NAME,
  FOUNDATION_QUEUE_NAME,
  WHATSAPP_QUEUE_NAME,
  redisConnection,
  type EmailSendJobData,
  type FoundationJobData,
  type WhatsappSendJobData
} from "@/lib/queue";
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

worker.on("ready", () => {
  console.log(`Worker ready on queue "${FOUNDATION_QUEUE_NAME}"`);
});

emailWorker.on("ready", () => {
  console.log(`Worker ready on queue "${EMAIL_QUEUE_NAME}"`);
});

whatsappWorker.on("ready", () => {
  console.log(`Worker ready on queue "${WHATSAPP_QUEUE_NAME}"`);
});

worker.on("completed", (job) => {
  console.log(`Completed job ${job.name}#${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Failed job ${job?.name ?? "unknown"}#${job?.id ?? "unknown"}:`, error);
});

process.on("SIGINT", async () => {
  await worker.close();
  await emailWorker.close();
  await whatsappWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await worker.close();
  await emailWorker.close();
  await whatsappWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});
