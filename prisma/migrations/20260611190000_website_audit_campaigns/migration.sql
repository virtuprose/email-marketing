CREATE TYPE "WebsiteAuditRunStatus" AS ENUM (
    'DRAFT',
    'QUEUED',
    'RUNNING',
    'REVIEW_READY',
    'CONVERTED',
    'FAILED'
);

CREATE TYPE "WebsiteAuditCandidateStatus" AS ENUM (
    'PENDING',
    'CHECKING',
    'AUDITED',
    'NEEDS_REVIEW',
    'APPROVED',
    'REJECTED',
    'CONVERTED',
    'FAILED'
);

ALTER TABLE "campaign_recipients"
ADD COLUMN "personalization" JSONB;

CREATE TABLE "website_audit_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WebsiteAuditRunStatus" NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'Website audit list',
    "country" TEXT,
    "legal_basis" TEXT,
    "selected_offer_id" TEXT,
    "campaign_id" TEXT,
    "max_pages_per_site" INTEGER NOT NULL DEFAULT 5,
    "total_candidates" INTEGER NOT NULL DEFAULT 0,
    "audited_count" INTEGER NOT NULL DEFAULT 0,
    "approved_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_audit_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "website_audit_candidates" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "website_url" TEXT NOT NULL,
    "normalized_domain" TEXT NOT NULL,
    "company_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "status" "WebsiteAuditCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "suggested_offer_id" TEXT,
    "recommended_service_name" TEXT,
    "mobile_app_score" INTEGER NOT NULL DEFAULT 0,
    "mobile_app_signals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "pain_points" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "missing_features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "evidence" JSONB,
    "generated_subject" TEXT,
    "generated_body" TEXT,
    "risk_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "lead_id" TEXT,
    "campaign_id" TEXT,
    "checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_audit_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "website_audit_runs_campaign_id_key" ON "website_audit_runs"("campaign_id");
CREATE INDEX "website_audit_runs_status_idx" ON "website_audit_runs"("status");
CREATE INDEX "website_audit_runs_selected_offer_id_idx" ON "website_audit_runs"("selected_offer_id");

CREATE UNIQUE INDEX "website_audit_candidates_run_id_normalized_domain_key"
ON "website_audit_candidates"("run_id", "normalized_domain");
CREATE INDEX "website_audit_candidates_run_id_idx" ON "website_audit_candidates"("run_id");
CREATE INDEX "website_audit_candidates_status_idx" ON "website_audit_candidates"("status");
CREATE INDEX "website_audit_candidates_normalized_domain_idx" ON "website_audit_candidates"("normalized_domain");
CREATE INDEX "website_audit_candidates_suggested_offer_id_idx" ON "website_audit_candidates"("suggested_offer_id");
CREATE INDEX "website_audit_candidates_lead_id_idx" ON "website_audit_candidates"("lead_id");
CREATE INDEX "website_audit_candidates_campaign_id_idx" ON "website_audit_candidates"("campaign_id");

ALTER TABLE "website_audit_runs"
ADD CONSTRAINT "website_audit_runs_selected_offer_id_fkey"
FOREIGN KEY ("selected_offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "website_audit_runs"
ADD CONSTRAINT "website_audit_runs_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "website_audit_candidates"
ADD CONSTRAINT "website_audit_candidates_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "website_audit_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "website_audit_candidates"
ADD CONSTRAINT "website_audit_candidates_suggested_offer_id_fkey"
FOREIGN KEY ("suggested_offer_id") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "website_audit_candidates"
ADD CONSTRAINT "website_audit_candidates_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "website_audit_candidates"
ADD CONSTRAINT "website_audit_candidates_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
