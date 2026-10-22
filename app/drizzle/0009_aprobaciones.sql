ALTER TABLE "items" ADD COLUMN "approval" jsonb;--> statement-breakpoint
-- La propietaria aprueba productos nuevos y eliminaciones.
UPDATE "roles" SET "perms" = "perms" || '["approve"]'::jsonb WHERE "key" = 'owner' AND NOT ("perms" ? 'approve');
