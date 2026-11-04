import { expect, it } from "vitest";
import { parseStockImport } from "./stockImport";
it("imports new products and opening quantities while preserving barcode digits", () => {
  const result = parseStockImport('name,initial_stock,barcode,sell_price\n"Food, large",12,00123,99.50', []);
  expect(result.errors).toEqual([]); expect(result.rows[0]).toEqual({ name: "Food, large", initial_stock: 12, barcode: "00123", sell_price: 99.5 });
});
it("rejects existing product codes rather than updating them", () => expect(parseStockImport("name,initial_stock,sku\nFood,3,SKU1", [{ sku: "sku1" }]).errors).toHaveLength(1));
it("rejects duplicate file codes", () => expect(parseStockImport("name,initial_stock,barcode\nFood,3,123\nOther,4,123", []).errors).toHaveLength(1));
it("rejects negative and non-finite opening stock", () => { expect(parseStockImport("name,initial_stock\nFood,-1", []).errors).toHaveLength(1); expect(parseStockImport("name,initial_stock\nFood,Infinity", []).errors).toHaveLength(1); });
it("requires opening stock rather than silently assuming zero", () => expect(parseStockImport("name,initial_stock\nFood,", []).errors).toHaveLength(1));