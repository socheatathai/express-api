ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_price_nonnegative" CHECK ("price" >= 0);

ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_quantity_nonnegative" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "Inventory_reserved_quantity_nonnegative" CHECK ("reservedQuantity" >= 0),
  ADD CONSTRAINT "Inventory_reserved_quantity_within_quantity" CHECK ("reservedQuantity" <= "quantity");
