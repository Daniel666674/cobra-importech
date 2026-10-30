CREATE TABLE "cash_closes" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"t" bigint NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"expected" integer NOT NULL,
	"counted" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"t" bigint NOT NULL,
	"kind" text NOT NULL,
	"method" text DEFAULT 'Efectivo' NOT NULL,
	"amount" integer NOT NULL,
	"concept" text DEFAULT '' NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	"voided" boolean DEFAULT false NOT NULL
);
