-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "WhatsappLeadStatus" AS ENUM ('UNKNOWN', 'OPTED_IN', 'STOPPED', 'INVALID');

-- CreateEnum
CREATE TYPE "WhatsappTemplateStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WhatsappTemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION', 'SERVICE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WhatsappCampaignStatus" AS ENUM ('DRAFT', 'REVIEW_BLOCKED', 'REVIEW_READY', 'APPROVED', 'SCHEDULED', 'SENDING', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WhatsappRecipientStatus" AS ENUM ('READY', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'REPLIED', 'SKIPPED', 'FAILED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "WhatsappMessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED', 'REPLIED');

-- CreateEnum
CREATE TYPE "WhatsappEventType" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED', 'REPLY_RECEIVED', 'AI_REPLY_DRAFTED', 'AI_REPLY_SENT', 'HOT_HANDOFF', 'OPTED_OUT', 'TEST_SENT', 'RATE_LIMITED');

-- AlterTable
ALTER TABLE "ai_reply_drafts" ADD COLUMN "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL';

-- AlterTable
ALTER TABLE "import_rows" ADD COLUMN "phone_e164" TEXT;

-- AlterTable
ALTER TABLE "inbound_replies" ADD COLUMN "channel" "MessageChannel" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN "from_phone_e164" TEXT,
ADD COLUMN "to_phone_e164" TEXT,
ADD COLUMN "whatsapp_message_id" TEXT,
ALTER COLUMN "from_email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "last_whatsapp_contacted_at" TIMESTAMP(3),
ADD COLUMN "phone_e164" TEXT,
ADD COLUMN "whatsapp_consent_source" TEXT,
ADD COLUMN "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "whatsapp_status" "WhatsappLeadStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "whatsapp_stopped_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content_sid" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "category" "WhatsappTemplateCategory" NOT NULL DEFAULT 'MARKETING',
    "status" "WhatsappTemplateStatus" NOT NULL DEFAULT 'APPROVED',
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "body_preview" TEXT,
    "example_variables" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WhatsappCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "offer_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "audience_filter" JSONB NOT NULL,
    "variable_mapping" JSONB NOT NULL,
    "estimated_recipients" INTEGER NOT NULL DEFAULT 0,
    "daily_cap" INTEGER NOT NULL DEFAULT 25,
    "send_window_start" TEXT,
    "send_window_end" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "status" "WhatsappRecipientStatus" NOT NULL DEFAULT 'READY',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_send_jobs" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "status" "SendJobStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "last_error" TEXT,
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "queued_messages" INTEGER NOT NULL DEFAULT 0,
    "sent_messages" INTEGER NOT NULL DEFAULT 0,
    "delivered_messages" INTEGER NOT NULL DEFAULT 0,
    "read_messages" INTEGER NOT NULL DEFAULT 0,
    "skipped_messages" INTEGER NOT NULL DEFAULT 0,
    "failed_messages" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_send_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "send_job_id" TEXT,
    "campaign_id" TEXT,
    "campaign_recipient_id" TEXT,
    "lead_id" TEXT NOT NULL,
    "template_id" TEXT,
    "status" "WhatsappMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "to_phone_e164" TEXT,
    "from_phone_e164" TEXT,
    "content_variables" JSONB,
    "body_text" TEXT,
    "provider_message_id" TEXT,
    "error" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_events" (
    "id" TEXT NOT NULL,
    "type" "WhatsappEventType" NOT NULL,
    "message_id" TEXT,
    "campaign_id" TEXT,
    "lead_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_content_sid_key" ON "whatsapp_templates"("content_sid");
CREATE INDEX "whatsapp_templates_status_idx" ON "whatsapp_templates"("status");
CREATE INDEX "whatsapp_templates_active_idx" ON "whatsapp_templates"("active");
CREATE INDEX "whatsapp_campaigns_status_idx" ON "whatsapp_campaigns"("status");
CREATE INDEX "whatsapp_campaigns_offer_id_idx" ON "whatsapp_campaigns"("offer_id");
CREATE INDEX "whatsapp_campaigns_template_id_idx" ON "whatsapp_campaigns"("template_id");
CREATE INDEX "whatsapp_campaign_recipients_status_idx" ON "whatsapp_campaign_recipients"("status");
CREATE UNIQUE INDEX "whatsapp_campaign_recipients_campaign_id_lead_id_key" ON "whatsapp_campaign_recipients"("campaign_id", "lead_id");
CREATE INDEX "whatsapp_send_jobs_campaign_id_idx" ON "whatsapp_send_jobs"("campaign_id");
CREATE INDEX "whatsapp_send_jobs_status_idx" ON "whatsapp_send_jobs"("status");
CREATE UNIQUE INDEX "whatsapp_messages_provider_message_id_key" ON "whatsapp_messages"("provider_message_id");
CREATE INDEX "whatsapp_messages_send_job_id_idx" ON "whatsapp_messages"("send_job_id");
CREATE INDEX "whatsapp_messages_campaign_id_idx" ON "whatsapp_messages"("campaign_id");
CREATE INDEX "whatsapp_messages_lead_id_idx" ON "whatsapp_messages"("lead_id");
CREATE INDEX "whatsapp_messages_status_idx" ON "whatsapp_messages"("status");
CREATE INDEX "whatsapp_messages_queued_at_idx" ON "whatsapp_messages"("queued_at");
CREATE INDEX "whatsapp_messages_to_phone_e164_idx" ON "whatsapp_messages"("to_phone_e164");
CREATE INDEX "whatsapp_messages_from_phone_e164_idx" ON "whatsapp_messages"("from_phone_e164");
CREATE INDEX "whatsapp_events_type_idx" ON "whatsapp_events"("type");
CREATE INDEX "whatsapp_events_message_id_idx" ON "whatsapp_events"("message_id");
CREATE INDEX "whatsapp_events_campaign_id_idx" ON "whatsapp_events"("campaign_id");
CREATE INDEX "whatsapp_events_lead_id_idx" ON "whatsapp_events"("lead_id");
CREATE INDEX "import_rows_phone_e164_idx" ON "import_rows"("phone_e164");
CREATE INDEX "inbound_replies_channel_idx" ON "inbound_replies"("channel");
CREATE INDEX "inbound_replies_whatsapp_message_id_idx" ON "inbound_replies"("whatsapp_message_id");
CREATE UNIQUE INDEX "leads_phone_e164_key" ON "leads"("phone_e164");
CREATE INDEX "leads_phone_e164_idx" ON "leads"("phone_e164");
CREATE INDEX "leads_whatsapp_status_idx" ON "leads"("whatsapp_status");
CREATE INDEX "leads_whatsapp_opt_in_idx" ON "leads"("whatsapp_opt_in");

-- AddForeignKey
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_whatsapp_message_id_fkey" FOREIGN KEY ("whatsapp_message_id") REFERENCES "whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "whatsapp_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_campaign_recipients" ADD CONSTRAINT "whatsapp_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_campaign_recipients" ADD CONSTRAINT "whatsapp_campaign_recipients_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_send_jobs" ADD CONSTRAINT "whatsapp_send_jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_send_job_id_fkey" FOREIGN KEY ("send_job_id") REFERENCES "whatsapp_send_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_campaign_recipient_id_fkey" FOREIGN KEY ("campaign_recipient_id") REFERENCES "whatsapp_campaign_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "whatsapp_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_events" ADD CONSTRAINT "whatsapp_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_events" ADD CONSTRAINT "whatsapp_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_events" ADD CONSTRAINT "whatsapp_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
