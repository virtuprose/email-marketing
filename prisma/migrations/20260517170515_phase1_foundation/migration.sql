-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'VALIDATED', 'SUPPRESSED', 'QUEUED', 'CONTACTED', 'REPLIED', 'INTERESTED', 'HOT', 'NOT_INTERESTED', 'UNSUBSCRIBED', 'BOUNCED', 'DO_NOT_CONTACT', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('IMPORTED', 'FLAGGED', 'DUPLICATE', 'INVALID', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBED', 'COMPLAINT', 'HARD_BOUNCE', 'MANUAL_BLOCK', 'RISKY_DOMAIN', 'COMPETITOR');

-- CreateEnum
CREATE TYPE "LeadEventType" AS ENUM ('IMPORTED', 'STATUS_CHANGED', 'TAGGED', 'SUPPRESSED', 'NOTE_UPDATED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_audience" TEXT NOT NULL,
    "pain_points" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "value_proposition" TEXT NOT NULL,
    "proof_points" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "services_included" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cta_style" TEXT NOT NULL,
    "disallowed_claims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_voice_rules" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "company" TEXT,
    "website" TEXT,
    "role" TEXT,
    "industry" TEXT,
    "country" TEXT,
    "timezone" TEXT,
    "source" TEXT,
    "source_url" TEXT,
    "legal_basis" TEXT,
    "consent_notes" TEXT,
    "owner_notes" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "score_fit" INTEGER NOT NULL DEFAULT 0,
    "score_engagement" INTEGER NOT NULL DEFAULT 0,
    "score_intent" INTEGER NOT NULL DEFAULT 0,
    "last_contacted_at" TIMESTAMP(3),
    "next_action_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_tags" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "suppressed_rows" INTEGER NOT NULL DEFAULT 0,
    "flagged_rows" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "email" TEXT,
    "status" "ImportRowStatus" NOT NULL,
    "issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lead_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_entries" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "notes" TEXT,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppression_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_events" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "type" "LeadEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "offers_name_key" ON "offers"("name");

-- CreateIndex
CREATE INDEX "offers_active_idx" ON "offers"("active");

-- CreateIndex
CREATE UNIQUE INDEX "leads_email_key" ON "leads"("email");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_company_idx" ON "leads"("company");

-- CreateIndex
CREATE INDEX "leads_source_idx" ON "leads"("source");

-- CreateIndex
CREATE INDEX "leads_country_idx" ON "leads"("country");

-- CreateIndex
CREATE INDEX "lead_tags_name_idx" ON "lead_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "lead_tags_lead_id_name_key" ON "lead_tags"("lead_id", "name");

-- CreateIndex
CREATE INDEX "import_rows_batch_id_idx" ON "import_rows"("batch_id");

-- CreateIndex
CREATE INDEX "import_rows_status_idx" ON "import_rows"("status");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_entries_email_key" ON "suppression_entries"("email");

-- CreateIndex
CREATE INDEX "suppression_entries_reason_idx" ON "suppression_entries"("reason");

-- CreateIndex
CREATE INDEX "lead_events_lead_id_idx" ON "lead_events"("lead_id");

-- CreateIndex
CREATE INDEX "lead_events_type_idx" ON "lead_events"("type");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_idx" ON "audit_logs"("entity_type");

-- AddForeignKey
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
