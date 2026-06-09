-- CreateEnum
CREATE TYPE "SalesLeadStage" AS ENUM ('NEW_ENQUIRY', 'INTERESTED', 'QUALIFIED_LEAD', 'MEETING_REQUESTED', 'MEETING_BOOKED', 'NOT_INTERESTED', 'FOLLOW_UP_REQUIRED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'OWNER_HANDOFF', 'CLOSED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "ConversationDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MeetingSlotStatus" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "MeetingBookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- AlterEnum
ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'WEBSITE_CHAT';
ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'INSTAGRAM';

-- AlterTable
ALTER TABLE "leads"
ADD COLUMN "sales_stage" "SalesLeadStage" NOT NULL DEFAULT 'NEW_ENQUIRY',
ADD COLUMN "preferred_language" TEXT,
ADD COLUMN "service_needed" TEXT,
ADD COLUMN "preferred_meeting_time" TEXT;

-- AlterTable
ALTER TABLE "inbound_replies"
ADD COLUMN "conversation_id" TEXT,
ADD COLUMN "language" TEXT,
ADD COLUMN "sales_stage" "SalesLeadStage",
ADD COLUMN "missing_contact_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "extracted_contact" JSONB;

-- CreateTable
CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "external_contact_id" TEXT,
  "language" TEXT,
  "stage" "SalesLeadStage" NOT NULL DEFAULT 'NEW_ENQUIRY',
  "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  "score_fit" INTEGER NOT NULL DEFAULT 0,
  "score_engagement" INTEGER NOT NULL DEFAULT 0,
  "score_intent" INTEGER NOT NULL DEFAULT 0,
  "total_score" INTEGER NOT NULL DEFAULT 0,
  "service_needed" TEXT,
  "preferred_meeting_time" TEXT,
  "missing_contact_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "owner_handoff_required" BOOLEAN NOT NULL DEFAULT false,
  "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "lead_id" TEXT,
  "channel" "MessageChannel" NOT NULL,
  "direction" "ConversationDirection" NOT NULL,
  "body_text" TEXT NOT NULL,
  "language" TEXT,
  "provider_message_id" TEXT,
  "inbound_reply_id" TEXT,
  "email_message_id" TEXT,
  "whatsapp_message_id" TEXT,
  "ai_reply_draft_id" TEXT,
  "raw" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_slots" (
  "id" TEXT NOT NULL,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuwait',
  "status" "MeetingSlotStatus" NOT NULL DEFAULT 'AVAILABLE',
  "notes" TEXT,
  "booked_lead_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "meeting_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_bookings" (
  "id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "slot_id" TEXT,
  "status" "MeetingBookingStatus" NOT NULL DEFAULT 'REQUESTED',
  "contact_name" TEXT,
  "phone_e164" TEXT,
  "email" TEXT,
  "company" TEXT,
  "service_needed" TEXT,
  "preferred_time_text" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "meeting_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_lead_id_idx" ON "conversations"("lead_id");
CREATE INDEX "conversations_channel_idx" ON "conversations"("channel");
CREATE INDEX "conversations_external_contact_id_idx" ON "conversations"("external_contact_id");
CREATE INDEX "conversations_stage_idx" ON "conversations"("stage");
CREATE INDEX "conversations_status_idx" ON "conversations"("status");
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

CREATE UNIQUE INDEX "conversation_messages_provider_message_id_key" ON "conversation_messages"("provider_message_id");
CREATE INDEX "conversation_messages_conversation_id_idx" ON "conversation_messages"("conversation_id");
CREATE INDEX "conversation_messages_lead_id_idx" ON "conversation_messages"("lead_id");
CREATE INDEX "conversation_messages_channel_idx" ON "conversation_messages"("channel");
CREATE INDEX "conversation_messages_direction_idx" ON "conversation_messages"("direction");
CREATE INDEX "conversation_messages_created_at_idx" ON "conversation_messages"("created_at");

CREATE INDEX "meeting_slots_start_at_idx" ON "meeting_slots"("start_at");
CREATE INDEX "meeting_slots_status_idx" ON "meeting_slots"("status");
CREATE INDEX "meeting_slots_booked_lead_id_idx" ON "meeting_slots"("booked_lead_id");

CREATE INDEX "meeting_bookings_lead_id_idx" ON "meeting_bookings"("lead_id");
CREATE INDEX "meeting_bookings_conversation_id_idx" ON "meeting_bookings"("conversation_id");
CREATE INDEX "meeting_bookings_slot_id_idx" ON "meeting_bookings"("slot_id");
CREATE INDEX "meeting_bookings_status_idx" ON "meeting_bookings"("status");

CREATE INDEX "inbound_replies_conversation_id_idx" ON "inbound_replies"("conversation_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meeting_slots" ADD CONSTRAINT "meeting_slots_booked_lead_id_fkey" FOREIGN KEY ("booked_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "meeting_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
