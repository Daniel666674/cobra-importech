ALTER TABLE "orders" ADD COLUMN "st_t" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "orders" SET "st_t" = "t" WHERE "st_t" = 0;
