ALTER TABLE "leads"
ADD COLUMN "ai_auto_reply_paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ai_auto_reply_paused_at" TIMESTAMP(3),
ADD COLUMN "ai_auto_reply_pause_reason" TEXT;

CREATE INDEX "leads_ai_auto_reply_paused_idx" ON "leads"("ai_auto_reply_paused");
