-- CreateEnum
CREATE TYPE "ReplyIntent" AS ENUM ('HOT_LEAD', 'MEETING_REQUEST', 'PRICING_REQUEST', 'PORTFOLIO_REQUEST', 'OBJECTION', 'GENERAL_INTEREST', 'NOT_INTERESTED', 'UNSUBSCRIBE', 'OUT_OF_OFFICE', 'WRONG_PERSON', 'COMPLAINT', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "ReplySentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "ReplyStatus" AS ENUM ('NEW', 'AI_CLASSIFIED', 'DRAFT_READY', 'OWNER_REVIEW', 'HOT_HANDOFF', 'AUTO_REPLIED', 'CLOSED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "AiReplyDraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'DISCARDED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('NEW', 'CONTACTED', 'REPLIED', 'ENGAGED', 'HOT', 'OWNER_HANDLING', 'PROPOSAL_SENT', 'FOLLOW_UP_LATER', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'PAUSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailEventType" ADD VALUE 'REPLY_RECEIVED';
ALTER TYPE "EmailEventType" ADD VALUE 'AI_REPLY_DRAFTED';
ALTER TYPE "EmailEventType" ADD VALUE 'REPLY_SENT';

-- CreateTable
CREATE TABLE "inbound_replies" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT,
    "campaign_id" TEXT,
    "email_message_id" TEXT,
    "from_email" TEXT NOT NULL,
    "to_email" TEXT,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "provider_message_id" TEXT,
    "message_id_header" TEXT,
    "in_reply_to" TEXT,
    "raw" JSONB,
    "status" "ReplyStatus" NOT NULL DEFAULT 'NEW',
    "intent" "ReplyIntent" NOT NULL DEFAULT 'UNCLEAR',
    "sentiment" "ReplySentiment" NOT NULL DEFAULT 'NEUTRAL',
    "ai_confidence" INTEGER NOT NULL DEFAULT 0,
    "ai_summary" TEXT,
    "ai_suggested_action" TEXT,
    "owner_action_required" BOOLEAN NOT NULL DEFAULT true,
    "auto_reply_eligible" BOOLEAN NOT NULL DEFAULT false,
    "risk_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_reply_drafts" (
    "id" TEXT NOT NULL,
    "reply_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "campaign_id" TEXT,
    "offer_id" TEXT,
    "status" "AiReplyDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "rationale" TEXT,
    "risk_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "policy_version" TEXT NOT NULL DEFAULT 'reply-policy-v1',
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_reply_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "offer_id" TEXT,
    "title" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'NEW',
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "value_estimate" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "priority_score" INTEGER NOT NULL DEFAULT 0,
    "next_action" TEXT,
    "next_action_at" TIMESTAMP(3),
    "last_reply_id" TEXT,
    "owner_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbound_replies_provider_message_id_key" ON "inbound_replies"("provider_message_id");

-- CreateIndex
CREATE INDEX "inbound_replies_lead_id_idx" ON "inbound_replies"("lead_id");

-- CreateIndex
CREATE INDEX "inbound_replies_campaign_id_idx" ON "inbound_replies"("campaign_id");

-- CreateIndex
CREATE INDEX "inbound_replies_intent_idx" ON "inbound_replies"("intent");

-- CreateIndex
CREATE INDEX "inbound_replies_status_idx" ON "inbound_replies"("status");

-- CreateIndex
CREATE INDEX "inbound_replies_received_at_idx" ON "inbound_replies"("received_at");

-- CreateIndex
CREATE INDEX "ai_reply_drafts_reply_id_idx" ON "ai_reply_drafts"("reply_id");

-- CreateIndex
CREATE INDEX "ai_reply_drafts_lead_id_idx" ON "ai_reply_drafts"("lead_id");

-- CreateIndex
CREATE INDEX "ai_reply_drafts_campaign_id_idx" ON "ai_reply_drafts"("campaign_id");

-- CreateIndex
CREATE INDEX "ai_reply_drafts_status_idx" ON "ai_reply_drafts"("status");

-- CreateIndex
CREATE INDEX "deals_stage_idx" ON "deals"("stage");

-- CreateIndex
CREATE INDEX "deals_status_idx" ON "deals"("status");

-- CreateIndex
CREATE INDEX "deals_priority_score_idx" ON "deals"("priority_score");

-- CreateIndex
CREATE UNIQUE INDEX "deals_lead_id_key" ON "deals"("lead_id");

-- AddForeignKey
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_email_message_id_fkey" FOREIGN KEY ("email_message_id") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reply_drafts" ADD CONSTRAINT "ai_reply_drafts_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "inbound_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reply_drafts" ADD CONSTRAINT "ai_reply_drafts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reply_drafts" ADD CONSTRAINT "ai_reply_drafts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reply_drafts" ADD CONSTRAINT "ai_reply_drafts_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
