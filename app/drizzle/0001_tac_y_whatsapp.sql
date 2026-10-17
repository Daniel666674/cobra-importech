CREATE TABLE "tac_models" (
	"tac" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"t" bigint NOT NULL,
	"by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "owner_phone" text DEFAULT '' NOT NULL;