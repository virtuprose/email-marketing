CREATE TYPE "EmailDesignValidationStatus" AS ENUM ('VALID', 'BLOCKED');

ALTER TABLE "campaigns"
ADD COLUMN "selected_email_design_template_id" TEXT;

CREATE TABLE "email_design_templates" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "original_html" TEXT NOT NULL,
    "sanitized_html" TEXT NOT NULL,
    "status" "EmailDesignValidationStatus" NOT NULL DEFAULT 'BLOCKED',
    "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "errors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_design_templates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "email_messages"
ADD COLUMN "body_html" TEXT,
ADD COLUMN "unsubscribe_url" TEXT,
ADD COLUMN "email_design_template_id" TEXT;

CREATE INDEX "campaigns_selected_email_design_template_id_idx" ON "campaigns"("selected_email_design_template_id");
CREATE INDEX "email_design_templates_campaign_id_idx" ON "email_design_templates"("campaign_id");
CREATE INDEX "email_design_templates_status_idx" ON "email_design_templates"("status");
CREATE INDEX "email_design_templates_selected_idx" ON "email_design_templates"("selected");
CREATE INDEX "email_messages_email_design_template_id_idx" ON "email_messages"("email_design_template_id");

ALTER TABLE "email_design_templates"
ADD CONSTRAINT "email_design_templates_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaigns"
ADD CONSTRAINT "campaigns_selected_email_design_template_id_fkey"
FOREIGN KEY ("selected_email_design_template_id") REFERENCES "email_design_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_messages"
ADD CONSTRAINT "email_messages_email_design_template_id_fkey"
FOREIGN KEY ("email_design_template_id") REFERENCES "email_design_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
