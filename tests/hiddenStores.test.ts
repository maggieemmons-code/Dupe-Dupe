import { test } from "node:test";
import assert from "node:assert/strict";
import { isHiddenStore } from "../lib/hiddenStores";

// Maggie's first two (Nov 15).
const hidden = [
  { name: "The Dress Outlet", domain: "thedressoutlet.com" },
  { name: "SHOP DDMINE", domain: "" },
];

test("hidden by web address or by name", () => {
  assert.equal(isHiddenStore({ store: "thedressoutlet", store_domain: "www.thedressoutlet.com" }, hidden), true);
  assert.equal(isHiddenStore({ store: "The Dress Outlet", store_domain: "" }, hidden), true);
  assert.equal(isHiddenStore({ store: "SHOP DDMINE", store_domain: "shopddmine.com" }, hidden), true);
});

test("other stores stay", () => {
  assert.equal(isHiddenStore({ store: "Revolve", store_domain: "revolve.com" }, hidden), false);
  assert.equal(isHiddenStore({ store: "The Dress Warehouse.", store_domain: "" }, hidden), false);
  assert.equal(isHiddenStore({ store: "Anything", store_domain: "x.com" }, []), false);
});
