CREATE TABLE "allies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"doc" text DEFAULT '' NOT NULL,
	"mode" text DEFAULT 'consignacion' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"t" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ally_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"ally" text NOT NULL,
	"t" bigint NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "ally" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "tradeins" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ally_moves" ADD CONSTRAINT "ally_moves_ally_allies_id_fk" FOREIGN KEY ("ally") REFERENCES "public"."allies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ally_moves_ally" ON "ally_moves" USING btree ("ally");