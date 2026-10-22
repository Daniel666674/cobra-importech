ALTER TABLE "allies" ADD COLUMN "terms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "allies" ADD COLUMN "bank" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ally_moves" ADD COLUMN "method" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ally_moves" ADD COLUMN "no" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ally_moves" ADD COLUMN "voided" boolean DEFAULT false NOT NULL;