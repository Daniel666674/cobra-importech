CREATE TABLE "autos" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"sale" text NOT NULL,
	"line" integer DEFAULT 0 NOT NULL,
	"t" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Abierto' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"doc" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed" (
	"id" serial PRIMARY KEY NOT NULL,
	"t" bigint NOT NULL,
	"type" text NOT NULL,
	"ic" text DEFAULT '' NOT NULL,
	"x" text NOT NULL,
	"by" text DEFAULT 'Sistema' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imei_blocklist" (
	"imei" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"t" bigint NOT NULL,
	"by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"t" bigint NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT '' NOT NULL,
	"by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"cat" text NOT NULL,
	"name" text NOT NULL,
	"spec" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"cond" text DEFAULT 'Nuevo' NOT NULL,
	"serial" text DEFAULT '' NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"warr" integer DEFAULT 12 NOT NULL,
	"branch" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'En vitrina' NOT NULL,
	"acq" bigint NOT NULL,
	"src" text DEFAULT '' NOT NULL,
	"batt" integer,
	"notes" text DEFAULT '' NOT NULL,
	"repairs" integer DEFAULT 0 NOT NULL,
	"min" integer DEFAULT 0 NOT NULL,
	"track" text DEFAULT 'unit' NOT NULL,
	"imei_check" jsonb,
	"hold" jsonb
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"item" text,
	"job" text NOT NULL,
	"st" text NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"tech" text DEFAULT '' NOT NULL,
	"t" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"sup" text NOT NULL,
	"desc" text DEFAULT '' NOT NULL,
	"qty" integer NOT NULL,
	"usd" integer NOT NULL,
	"trm" integer NOT NULL,
	"freight" real DEFAULT 0 NOT NULL,
	"arancel" real DEFAULT 0 NOT NULL,
	"iva" integer DEFAULT 19 NOT NULL,
	"st" text NOT NULL,
	"t" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"perms" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"t" bigint NOT NULL,
	"client" text,
	"by" text NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"mode" text DEFAULT 'contado' NOT NULL,
	"payments" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"disc" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"prepaid" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"legal" text DEFAULT '' NOT NULL,
	"nit" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"footer" text DEFAULT '' NOT NULL,
	"brand" text DEFAULT '#1F2937' NOT NULL,
	"logo" text DEFAULT '' NOT NULL,
	"branch" text DEFAULT 'Tienda principal' NOT NULL,
	"warr" jsonb NOT NULL,
	"max_disc" integer DEFAULT 5 NOT NULL,
	"min_margin" integer DEFAULT 12 NOT NULL,
	"trm" integer DEFAULT 4000 NOT NULL,
	"aged_days" integer DEFAULT 45 NOT NULL,
	"hold_days" integer DEFAULT 5 NOT NULL,
	"apartado_min_pct" integer DEFAULT 20 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"pin_hash" text NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"locked_until" bigint DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_roles_key_fk" FOREIGN KEY ("role") REFERENCES "public"."roles"("key") ON DELETE no action ON UPDATE no action;