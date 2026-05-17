-- CreateEnum
CREATE TYPE "CampaignObjective" AS ENUM ('AWARENESS', 'AUDIT_OFFER', 'MEETING_REQUEST', 'REACTIVATION', 'FOLLOW_UP', 'PROPOSAL');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'REVIEW_BLOCKED', 'REVIEW_READY', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('DRAFT', 'READY', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "CampaignReviewSeverity" AS ENUM ('PASS', 'WARNING', 'BLOCK');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" "CampaignObjective" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "offer_id" TEXT NOT NULL,
    "audience_filter" JSONB NOT NULL,
    "estimated_recipients" INTEGER NOT NULL DEFAULT 0,
    "personalization_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risk_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "claims_used" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_confidence" INTEGER NOT NULL DEFAULT 0,
    "ai_explanation" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_steps" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "delay_days" INTEGER NOT NULL DEFAULT 0,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_variants" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generations" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_reviews" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "severity" "CampaignReviewSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_objective_idx" ON "campaigns"("objective");

-- CreateIndex
CREATE INDEX "campaigns_offer_id_idx" ON "campaigns"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_steps_campaign_id_step_order_key" ON "campaign_steps"("campaign_id", "step_order");

-- CreateIndex
CREATE INDEX "campaign_variants_campaign_id_idx" ON "campaign_variants"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_recipients_status_idx" ON "campaign_recipients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_lead_id_key" ON "campaign_recipients"("campaign_id", "lead_id");

-- CreateIndex
CREATE INDEX "ai_generations_campaign_id_idx" ON "ai_generations"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_reviews_campaign_id_idx" ON "campaign_reviews"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_reviews_severity_idx" ON "campaign_reviews"("severity");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_steps" ADD CONSTRAINT "campaign_steps_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_variants" ADD CONSTRAINT "campaign_variants_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_reviews" ADD CONSTRAINT "campaign_reviews_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
