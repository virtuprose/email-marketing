-- CreateEnum
CREATE TYPE "SendingAccountStatus" AS ENUM ('ACTIVE', 'PAUSED', 'AUTH_FAILED', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "SendJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailMessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED', 'RATE_LIMITED', 'UNSUBSCRIBED', 'OPENED', 'CLICKED', 'TEST_SENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignRecipientStatus" ADD VALUE 'QUEUED';
ALTER TYPE "CampaignRecipientStatus" ADD VALUE 'SENT';
ALTER TYPE "CampaignRecipientStatus" ADD VALUE 'SKIPPED';
ALTER TYPE "CampaignRecipientStatus" ADD VALUE 'FAILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "CampaignStatus" ADD VALUE 'SENDING';
ALTER TYPE "CampaignStatus" ADD VALUE 'PAUSED';
ALTER TYPE "CampaignStatus" ADD VALUE 'COMPLETED';

-- CreateTable
CREATE TABLE "sending_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'smtp',
    "status" "SendingAccountStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "reply_to" TEXT,
    "host" TEXT,
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "last_error" TEXT,
    "last_test_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sending_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sending_limits" (
    "id" TEXT NOT NULL,
    "sending_account_id" TEXT NOT NULL,
    "daily_cap" INTEGER NOT NULL DEFAULT 25,
    "per_minute_cap" INTEGER NOT NULL DEFAULT 2,
    "per_domain_daily_cap" INTEGER NOT NULL DEFAULT 10,
    "min_delay_seconds" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sending_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sending_domains" (
    "id" TEXT NOT NULL,
    "sending_account_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "spf_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "dkim_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "dmarc_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "health_status" TEXT NOT NULL DEFAULT 'PENDING',
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sending_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "send_jobs" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "sending_account_id" TEXT NOT NULL,
    "status" "SendJobStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "last_error" TEXT,
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "queued_messages" INTEGER NOT NULL DEFAULT 0,
    "sent_messages" INTEGER NOT NULL DEFAULT 0,
    "skipped_messages" INTEGER NOT NULL DEFAULT 0,
    "failed_messages" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "send_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "send_job_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "campaign_recipient_id" TEXT NOT NULL,
    "campaign_step_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "sending_account_id" TEXT NOT NULL,
    "status" "EmailMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "recipient_email" TEXT NOT NULL,
    "recipient_domain" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "message_id_header" TEXT,
    "error" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "type" "EmailEventType" NOT NULL,
    "message_id" TEXT,
    "campaign_id" TEXT,
    "lead_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unsubscribe_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "email" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unsubscribe_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sending_accounts_name_key" ON "sending_accounts"("name");

-- CreateIndex
CREATE INDEX "sending_accounts_status_idx" ON "sending_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sending_limits_sending_account_id_key" ON "sending_limits"("sending_account_id");

-- CreateIndex
CREATE INDEX "sending_domains_domain_idx" ON "sending_domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "sending_domains_sending_account_id_domain_key" ON "sending_domains"("sending_account_id", "domain");

-- CreateIndex
CREATE INDEX "send_jobs_campaign_id_idx" ON "send_jobs"("campaign_id");

-- CreateIndex
CREATE INDEX "send_jobs_status_idx" ON "send_jobs"("status");

-- CreateIndex
CREATE INDEX "email_messages_send_job_id_idx" ON "email_messages"("send_job_id");

-- CreateIndex
CREATE INDEX "email_messages_campaign_id_idx" ON "email_messages"("campaign_id");

-- CreateIndex
CREATE INDEX "email_messages_lead_id_idx" ON "email_messages"("lead_id");

-- CreateIndex
CREATE INDEX "email_messages_status_idx" ON "email_messages"("status");

-- CreateIndex
CREATE INDEX "email_messages_queued_at_idx" ON "email_messages"("queued_at");

-- CreateIndex
CREATE INDEX "email_events_type_idx" ON "email_events"("type");

-- CreateIndex
CREATE INDEX "email_events_message_id_idx" ON "email_events"("message_id");

-- CreateIndex
CREATE INDEX "email_events_campaign_id_idx" ON "email_events"("campaign_id");

-- CreateIndex
CREATE INDEX "email_events_lead_id_idx" ON "email_events"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "unsubscribe_tokens_token_key" ON "unsubscribe_tokens"("token");

-- CreateIndex
CREATE INDEX "unsubscribe_tokens_lead_id_idx" ON "unsubscribe_tokens"("lead_id");

-- CreateIndex
CREATE INDEX "unsubscribe_tokens_campaign_id_idx" ON "unsubscribe_tokens"("campaign_id");

-- AddForeignKey
ALTER TABLE "sending_limits" ADD CONSTRAINT "sending_limits_sending_account_id_fkey" FOREIGN KEY ("sending_account_id") REFERENCES "sending_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_sending_account_id_fkey" FOREIGN KEY ("sending_account_id") REFERENCES "sending_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_sending_account_id_fkey" FOREIGN KEY ("sending_account_id") REFERENCES "sending_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_send_job_id_fkey" FOREIGN KEY ("send_job_id") REFERENCES "send_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_campaign_recipient_id_fkey" FOREIGN KEY ("campaign_recipient_id") REFERENCES "campaign_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_campaign_step_id_fkey" FOREIGN KEY ("campaign_step_id") REFERENCES "campaign_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_sending_account_id_fkey" FOREIGN KEY ("sending_account_id") REFERENCES "sending_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribe_tokens" ADD CONSTRAINT "unsubscribe_tokens_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unsubscribe_tokens" ADD CONSTRAINT "unsubscribe_tokens_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
