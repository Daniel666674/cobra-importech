ALTER TABLE "users" ADD COLUMN "username" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Usuarios existentes: el usuario se arma con el primer nombre (sin tildes, minúsculas) y deben cambiar el PIN por una contraseña.
UPDATE "users" SET "username" = lower(regexp_replace(translate(split_part(trim("name"), ' ', 1), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]', '', 'g')), "must_change" = true;--> statement-breakpoint
UPDATE "users" SET "username" = 'usuario' WHERE length("username") < 3;--> statement-breakpoint
UPDATE "users" u SET "username" = u."username" || regexp_replace(u."id", '\D', '', 'g') WHERE EXISTS (SELECT 1 FROM "users" v WHERE v."username" = u."username" AND v."id" < u."id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username" ON "users" USING btree ("username");
