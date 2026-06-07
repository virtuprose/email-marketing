import { Queue, type JobsOptions } from "bullmq";
import type { RedisOptions } from "ioredis";

export const FOUNDATION_QUEUE_NAME = "foundation";
export const EMAIL_QUEUE_NAME = "email-sending";
export const WHATSAPP_QUEUE_NAME = "whatsapp-sending";
export const AI_REPLY_QUEUE_NAME = "ai-reply-sending";

export type FoundationJobData = {
  message: string;
  requestedAt: string;
};

export type EmailSendJobData = {
  messageId: string;
};

export type WhatsappSendJobData = {
  messageId: string;
};

export type AiReplyJobData = {
  draftId: string;
};

export function redisConnection(): RedisOptions {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined,
    maxRetriesPerRequest: null
  };
}

export function foundationQueue() {
  return new Queue<FoundationJobData>(FOUNDATION_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: foundationJobOptions()
  });
}

export function emailQueue() {
  return new Queue<EmailSendJobData>(EMAIL_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: emailJobOptions()
  });
}

export function whatsappQueue() {
  return new Queue<WhatsappSendJobData>(WHATSAPP_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: whatsappJobOptions()
  });
}

export function aiReplyQueue() {
  return new Queue<AiReplyJobData>(AI_REPLY_QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: aiReplyJobOptions()
  });
}

export function foundationJobOptions(): JobsOptions {
  return {
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 50
  };
}

export function emailJobOptions(): JobsOptions {
  return {
    attempts: 1,
    removeOnComplete: 500,
    removeOnFail: 500
  };
}

export function whatsappJobOptions(): JobsOptions {
  return {
    attempts: 1,
    removeOnComplete: 500,
    removeOnFail: 500
  };
}

export function aiReplyJobOptions(): JobsOptions {
  return {
    attempts: 1,
    removeOnComplete: 500,
    removeOnFail: 500
  };
}
