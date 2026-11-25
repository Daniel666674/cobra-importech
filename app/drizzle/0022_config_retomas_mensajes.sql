ALTER TABLE "settings" ADD COLUMN "trade_rates" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "trade_deds" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "wa_receipt" text DEFAULT '' NOT NULL;