UPDATE "campaigns"
SET "selected_email_design_template_id" = NULL
WHERE "selected_email_design_template_id" IS NOT NULL;

UPDATE "email_messages"
SET "email_design_template_id" = NULL
WHERE "email_design_template_id" IS NOT NULL;

DELETE FROM "email_design_templates";

ALTER TABLE "email_design_templates"
DROP CONSTRAINT IF EXISTS "email_design_templates_campaign_id_fkey";

DROP INDEX IF EXISTS "email_design_templates_campaign_id_idx";
DROP INDEX IF EXISTS "email_design_templates_selected_idx";

ALTER TABLE "email_design_templates"
DROP COLUMN IF EXISTS "campaign_id",
DROP COLUMN IF EXISTS "selected",
ADD COLUMN "slug" TEXT,
ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "built_in" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "email_design_templates"
ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "email_design_templates_slug_key" ON "email_design_templates"("slug");
CREATE INDEX "email_design_templates_active_idx" ON "email_design_templates"("active");
