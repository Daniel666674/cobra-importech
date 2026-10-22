ALTER TABLE "sales" ALTER COLUMN "disc" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "ext_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "whatsapp" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "web" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "instagram" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "tax_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "legal_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "inv_prefix" text DEFAULT 'FV-' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "inv_title" text DEFAULT 'Comprobante de venta' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "warr_terms" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "methods" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "show_signatures" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "sales_ext_key" ON "sales" USING btree ("ext_key");