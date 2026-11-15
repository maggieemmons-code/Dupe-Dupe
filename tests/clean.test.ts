/** Cleaning step and store vetting (PLAN.md › Testing › automated checks). Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCandidates, type CleanRow, type CleanContext } from "../lib/search/clean";
import { vetStore } from "../lib/stores";

const ctx: CleanContext = {
  budget: 300,
  priceFloor: 113,
  brand: "Sau Lee",
  styleName: "Joanna Jacquard Gown",
  sizes: ["4"],
  hiddenStores: [],
  secondhandOn: false,
};

let n = 0;
function row(over: Partial<CleanRow>): CleanRow {
  return {
    id: `r${++n}`,
    kind: "new",
    source: "shopping",
    rating: null,
    reviews: null,
    title: `Red gown ${n}`,
    store: "Nordstrom",
    store_domain: "",
    link: `https://example.com/${n}`,
    photo_url: null,
    price: 200,
    in_stock: null,
    size: "",
    ...over,
  };
}

const reason = (r: CleanRow, c = ctx) => cleanCandidates([r], c)[0].drop_reason;

test("approved store in range is kept", () => assert.equal(reason(row({})), null));
test("over budget is dropped", () => assert.equal(reason(row({ price: 350 })), "Over budget"));
test("under the price floor is dropped", () => assert.equal(reason(row({ price: 60 })), "Under the price floor"));
test("no price is dropped", () => assert.equal(reason(row({ price: null })), "No price shown"));
test("unknown store is hidden", () => assert.equal(reason(row({ store: "Pomuyoo" })), "Store not approved"));
test("blocked store is hidden", () => assert.equal(reason(row({ store: "SHEIN" })), "Blocked store"));
test("social sites aren't stores", () => assert.equal(reason(row({ store: "Instagram", store_domain: "instagram.com" })), "Not a store"));
test("the original itself is dropped", () =>
  assert.equal(reason(row({ title: "Sau Lee Joanna Jacquard Gown", store: "Revolve" })), "Your original"));
test("Amazon needs 4 stars from 100 reviews", () => {
  assert.equal(reason(row({ source: "amazon", store: "Amazon", store_domain: "amazon.com", rating: 4.6, reviews: 30 })), "Amazon: under 4 stars or 100 reviews");
  assert.equal(reason(row({ source: "amazon", store: "Amazon", store_domain: "amazon.com", rating: 4.2, reviews: 500 })), null);
});
test("hidden stores are dropped", () => assert.equal(reason(row({}), { ...ctx, hiddenStores: ["Nordstrom"] }), "Hidden store"));

test("duplicates merge into the cheapest", () => {
  const a = row({ title: "Lovers and Friends Mischa Gown in Red", price: 198, store: "REVOLVE" });
  const b = row({ title: "Lovers and Friends Mischa Gown in Red", price: 180, store: "Nordstrom" });
  const out = cleanCandidates([a, b], ctx);
  assert.equal(out.find((x) => x.id === b.id)?.drop_reason, null);
  assert.equal(out.find((x) => x.id === a.id)?.duplicate_of, b.id);
});

test("store names match however Google writes them", () => {
  assert.equal(vetStore("Azazie.com", ""), "approved");
  assert.equal(vetStore("Macy's", ""), "approved");
  assert.equal(vetStore("Oh Polly US", ""), "approved");
  assert.equal(vetStore("", "www.revolve.com"), "approved");
  assert.equal(vetStore("Fashion Nova", ""), "blocked");
  assert.equal(vetStore("ohcici.us", "ohcici.us"), "unknown");
});
