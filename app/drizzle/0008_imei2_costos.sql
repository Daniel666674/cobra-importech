ALTER TABLE "items" ADD COLUMN "serial2" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- El valor del Excel de inventario es el COSTO (deshace 0007): queda sin precio hasta que la tienda ponga su ganancia.
UPDATE "items" SET "cost" = "price", "price" = 0
WHERE "src" LIKE 'Importado: %' AND "status" <> 'Vendido' AND "cost" = 0 AND "price" > 0;
