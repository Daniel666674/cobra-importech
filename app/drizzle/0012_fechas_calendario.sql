ALTER TABLE "allies" ADD COLUMN "due" bigint;--> statement-breakpoint
-- Los plazos en días que ya existían pasan a una fecha en el calendario.
UPDATE "allies" SET "due" = (extract(epoch from now()) * 1000)::bigint + "terms" * 86400000 WHERE "terms" > 0 AND "due" IS NULL;
