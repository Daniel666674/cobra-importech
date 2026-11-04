ALTER TABLE "items" ADD COLUMN "sim" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "banks" jsonb DEFAULT '["Banco Importech","Banco Andrés"]'::jsonb NOT NULL;