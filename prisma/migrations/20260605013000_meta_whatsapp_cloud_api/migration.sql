-- Preserve existing local template identifiers while moving the provider concept
-- from Twilio ContentSid to Meta template name.
DROP INDEX IF EXISTS "whatsapp_templates_content_sid_key";

ALTER TABLE "whatsapp_templates"
RENAME COLUMN "content_sid" TO "meta_template_name";

ALTER TABLE "whatsapp_templates"
ADD COLUMN "meta_template_id" TEXT;

CREATE UNIQUE INDEX "whatsapp_templates_meta_template_name_key"
ON "whatsapp_templates"("meta_template_name");

ALTER TABLE "leads"
ADD COLUMN "last_whatsapp_customer_message_at" TIMESTAMP(3),
ADD COLUMN "whatsapp_service_window_expires_at" TIMESTAMP(3),
ADD COLUMN "whatsapp_bot_paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "whatsapp_handoff_reason" TEXT;
