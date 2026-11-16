import { test } from "node:test";
import assert from "node:assert/strict";
import { pickStoreSearches } from "../lib/search/storeTally";

test("no history: Revolve and Nordstrom", () => {
  assert.deepEqual(pickStoreSearches([]), ["Revolve", "Nordstrom"]);
});

test("the friend's best stores across searches win; clicks count double", () => {
  const hits = [
    { store: "Meshki US", search_id: "a" },
    { store: "meshki us", search_id: "b" },
    { store: "Club L London", search_id: "a" },
    { store: "Club L London", search_id: "c", clicked: true },
    { store: "Revolve", search_id: "a" },
  ];
  assert.deepEqual(pickStoreSearches(hits), ["Club L London", "Meshki US"]);
});

test("one search isn't enough, and marketplaces don't count", () => {
  const hits = [
    { store: "Dessy", search_id: "a" },
    { store: "Dessy", search_id: "a" },
    { store: "Amazon.com", search_id: "a" },
    { store: "Amazon.com", search_id: "b" },
    { store: "eBay - seller1", search_id: "b" },
    { store: "eBay - seller1", search_id: "c" },
  ];
  assert.deepEqual(pickStoreSearches(hits), ["Revolve", "Nordstrom"]);
});

test("one learned store plus one default", () => {
  assert.deepEqual(pickStoreSearches([{ store: "Windsor", search_id: "a" }, { store: "Windsor", search_id: "b" }]), ["Windsor", "Revolve"]);
});

test("pieces from a store's own scoped search don't count for it", () => {
  const hits = [
    { store: "REVOLVE", search_id: "a", query: "white strapless gown revolve" },
    { store: "Revolve", search_id: "b", query: "red velvet gown revolve" },
    { store: "Meshki US", search_id: "a", query: "white strapless gown" },
    { store: "Meshki US", search_id: "b", query: "red velvet gown" },
  ];
  assert.deepEqual(pickStoreSearches(hits, 1), ["Meshki US"]);
});

