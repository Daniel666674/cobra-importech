ALTER TABLE "sales" ADD COLUMN "branch" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "categories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "branches" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "sales" SET "branch" = COALESCE((SELECT "branch" FROM "settings" LIMIT 1), '') WHERE "branch" = '';
