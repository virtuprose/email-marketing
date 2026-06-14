ALTER TYPE "ReplyIntent" ADD VALUE IF NOT EXISTS 'NON_SALES';
ALTER TYPE "SalesLeadStage" ADD VALUE IF NOT EXISTS 'NOT_A_LEAD';

ALTER TABLE "leads"
ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deleted_reason" TEXT;

CREATE TABLE IF NOT EXISTS "lead_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "lead_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lead_groups_name_key" ON "lead_groups"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "lead_group_members_group_id_lead_id_key" ON "lead_group_members"("group_id", "lead_id");
CREATE INDEX IF NOT EXISTS "lead_group_members_lead_id_idx" ON "lead_group_members"("lead_id");
CREATE INDEX IF NOT EXISTS "leads_deleted_at_idx" ON "leads"("deleted_at");

ALTER TABLE "lead_group_members"
ADD CONSTRAINT "lead_group_members_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "lead_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_group_members"
ADD CONSTRAINT "lead_group_members_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
