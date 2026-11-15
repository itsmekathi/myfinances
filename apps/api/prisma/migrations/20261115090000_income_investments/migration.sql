-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('expense', 'income', 'investment');

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('income', 'investment');

-- DropIndex
DROP INDEX "Category_workspaceId_parentId_name_key";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "kind" "CategoryKind" NOT NULL DEFAULT 'expense';

-- CreateTable
CREATE TABLE "Entry" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" "EntryKind" NOT NULL,
    "categoryId" UUID,
    "subcategoryId" UUID,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdClient" JSONB,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedClient" JSONB,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Entry_workspaceId_kind_date_idx" ON "Entry"("workspaceId", "kind", "date");

-- CreateIndex
CREATE INDEX "Entry_workspaceId_categoryId_idx" ON "Entry"("workspaceId", "categoryId");

-- CreateIndex
CREATE INDEX "Entry_tags_idx" ON "Entry" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Category_workspaceId_kind_parentId_name_key" ON "Category"("workspaceId", "kind", "parentId", "name");

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: default income and investment categories for every existing workspace
-- (new workspaces get them at signup from seedDefaultCategories). Safe to run more than once.
INSERT INTO "Category" ("id", "workspaceId", "kind", "name", "icon", "color", "updatedAt")
SELECT gen_random_uuid(), w."id", 'income'::"CategoryKind", d.name, d.icon, d.color, CURRENT_TIMESTAMP
FROM "Workspace" w
CROSS JOIN (VALUES
    ('Salary', 'briefcase', '#2A9D8F'),
    ('Freelance & business', 'laptop', '#3F88C5'),
    ('Interest', 'percent', '#8A6FDF'),
    ('Dividends', 'trending-up', '#1B998B'),
    ('Rental income', 'home', '#6C4AB6'),
    ('Refunds & cashback', 'rotate-ccw', '#F3A712'),
    ('Gifts', 'gift', '#E4572E'),
    ('Other', 'circle', '#7D8491')
) AS d(name, icon, color)
WHERE NOT EXISTS (
    SELECT 1 FROM "Category" e
    WHERE e."workspaceId" = w."id" AND e."kind" = 'income'::"CategoryKind"
      AND e."parentId" IS NULL AND lower(e."name") = lower(d.name)
)
ON CONFLICT DO NOTHING;

INSERT INTO "Category" ("id", "workspaceId", "kind", "parentId", "name", "color", "updatedAt")
SELECT gen_random_uuid(), p."workspaceId", 'income'::"CategoryKind", p."id", c.name, p."color", CURRENT_TIMESTAMP
FROM "Category" p
CROSS JOIN (VALUES ('Bonus'), ('Reimbursement')) AS c(name)
WHERE p."kind" = 'income' AND p."parentId" IS NULL AND p."name" = 'Salary'
ON CONFLICT DO NOTHING;

INSERT INTO "Category" ("id", "workspaceId", "kind", "name", "icon", "color", "updatedAt")
SELECT gen_random_uuid(), w."id", 'investment'::"CategoryKind", d.name, d.icon, d.color, CURRENT_TIMESTAMP
FROM "Workspace" w
CROSS JOIN (VALUES
    ('Mutual funds', 'pie-chart', '#2E86AB'),
    ('Stocks', 'trending-up', '#29BF12'),
    ('Fixed deposits', 'landmark', '#6C4AB6'),
    ('PPF / EPF / NPS', 'piggy-bank', '#F3A712'),
    ('Gold', 'gem', '#D4A017'),
    ('Crypto', 'bitcoin', '#E4572E'),
    ('Other', 'circle', '#7D8491')
) AS d(name, icon, color)
WHERE NOT EXISTS (
    SELECT 1 FROM "Category" e
    WHERE e."workspaceId" = w."id" AND e."kind" = 'investment'::"CategoryKind"
      AND e."parentId" IS NULL AND lower(e."name") = lower(d.name)
)
ON CONFLICT DO NOTHING;

INSERT INTO "Category" ("id", "workspaceId", "kind", "parentId", "name", "color", "updatedAt")
SELECT gen_random_uuid(), p."workspaceId", 'investment'::"CategoryKind", p."id", c.name, p."color", CURRENT_TIMESTAMP
FROM "Category" p
CROSS JOIN (VALUES ('SIP'), ('Lump sum')) AS c(name)
WHERE p."kind" = 'investment' AND p."parentId" IS NULL AND p."name" = 'Mutual funds'
ON CONFLICT DO NOTHING;
