-- El valor del Excel de inventario es el precio al cliente (se había leído como costo y se le sumó 25 %).
UPDATE "items" SET "price" = "cost", "cost" = 0
WHERE "src" LIKE 'Importado: %' AND "status" <> 'Vendido' AND "cost" > 0
  AND "price" = CEIL("cost" * 1.25 / 10000) * 10000;
