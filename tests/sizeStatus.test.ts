import { test } from "node:test";
import assert from "node:assert/strict";
import { sizeStatus } from "../lib/candidates";
import type { Checklist } from "../lib/search/score";

const withSize = (size_available: Checklist["size_available"]) => ({ checklist: { size_available } as Checklist, availability: null });

test("the judge's size answer reaches the card", () => {
  assert.deepEqual(sizeStatus(withSize("yes"), ["M"]).short, "Size M in stock");
  assert.equal(sizeStatus(withSize("yes"), ["M"]).inStock, true);
  assert.equal(sizeStatus(withSize("no"), ["M", "6"]).short, "M / 6 sold out or not made");
  assert.equal(sizeStatus(withSize("no"), ["M"]).inStock, false);
});

test("unknown size falls back to stock", () => {
  assert.equal(sizeStatus({ checklist: null, availability: "in_stock" }, ["M"]).short, "In stock · size not checked");
  assert.equal(sizeStatus(withSize("unknown"), ["M"]).short, "Stock not checked");
});
