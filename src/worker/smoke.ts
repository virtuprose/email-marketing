import { QueueEvents, Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { FOUNDATION_QUEUE_NAME, foundationQueue, redisConnection, type FoundationJobData } from "@/lib/queue";

async function main() {
  const queue = foundationQueue();
  const queueEvents = new QueueEvents(FOUNDATION_QUEUE_NAME, {
    connection: redisConnection()
  });
  const worker = new Worker<FoundationJobData>(
    FOUNDATION_QUEUE_NAME,
    async (job) => {
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

  await queueEvents.waitUntilReady();
  await worker.waitUntilReady();

  const job = await queue.add("phase0.smoke", {
    message: "Phase 0 worker smoke test",
    requestedAt: new Date().toISOString()
  });

  const result = await job.waitUntilFinished(queueEvents, 10_000);
  console.log(JSON.stringify({ jobId: job.id, result }));

  await worker.close();
  await queueEvents.close();
  await queue.close();
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
