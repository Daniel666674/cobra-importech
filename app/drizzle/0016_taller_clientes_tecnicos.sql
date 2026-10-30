CREATE TABLE "tech_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"tech" text NOT NULL,
	"t" bigint NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"voided" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"t" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "client" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "device" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "serial" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "extras" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tech_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tech_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "outcome" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "done_t" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tech_moves" ADD CONSTRAINT "tech_moves_tech_technicians_id_fk" FOREIGN KEY ("tech") REFERENCES "public"."technicians"("id") ON DELETE no action ON UPDATE no action;