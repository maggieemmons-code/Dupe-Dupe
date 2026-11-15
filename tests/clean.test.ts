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
test("no price is dropped for Shopping", () => assert.equal(reason(row({ price: null })), "No price shown"));
test("a Lens match without a price stays (its price is read later)", () =>
  assert.equal(reason(row({ price: null, source: "lens", store: "Club L London", store_domain: "clubllondon.us" })), null));
test("an unknown store is allowed", () => assert.equal(reason(row({ store: "Some New Label" })), null));
test("a doubtful site is blocked", () => assert.equal(reason(row({ store: "Pomuyoo" })), "Blocked store"));
test("a marketplace seller under a big store's name is blocked", () =>
  assert.equal(reason(row({ store: "Walmart - Pocketful Deals" })), "Blocked store"));
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
  assert.equal(vetStore("ohcici.us", "ohcici.us"), "blocked");
  assert.equal(vetStore("Some New Label", "somenewlabel.com"), "unknown");
});

test("the original sold at another store is dropped", () => {
  const amaya = { ...ctx, brand: "Mother of All", styleName: "Amaya Strapless Maxi Dress" };
  assert.equal(reason(row({ price: null, source: "lens", store: "Nykaa Fashion US", title: "Buy Mother of All Amaya Women's Strapless Boned Bodice Maxi" }), amaya), "Your original");
  const boots = { ...ctx, brand: "Saint Laurent", styleName: "Francoise Boots in Smooth Leather", budget: 1410 };
  assert.equal(reason(row({ price: null, source: "lens", store: "Bergdorf Goodman", title: "Saint Laurent Françoise Leather Knee-High Boots" }), boots), "Your original");
  const bb = { ...ctx, brand: "Bronx and Banco", styleName: "Florentina" };
  assert.equal(reason(row({ price: null, source: "lens", store: "Revolve", title: "Bronx Banco Florentina Strapless Velvet Gown in Burgundy" }), bb), "Your original");
});

test("another piece from the same brand stays", () => {
  const sei = { ...ctx, brand: "The Sei", styleName: "Halter Drape Bias Gown", budget: 640 };
  assert.equal(reason(row({ price: 400, store: "Editorialist", title: "The Sei Cowl Bias Gown In Slate Blue" }), sei), null);
});

test("category pages are dropped", () => {
  assert.equal(reason(row({ price: null, source: "lens", store: "Nordstrom", title: "Shop Pink Mulberry Online" })), "Not a product page");
  assert.equal(reason(row({ price: null, source: "lens", store: "Windsor", title: "Women's Black Fall Jackets" })), "Not a product page");
  assert.equal(reason(row({ price: null, source: "lens", store: "John Lewis", title: "View all Women's Accessories – Pink, Bayswater" })), "Not a product page");
  assert.equal(reason(row({ price: null, source: "lens", store: "Revolve", title: "White Button Down Bodysuits" })), "Not a product page");
  assert.equal(reason(row({ price: null, source: "lens", store: "Revolve", title: "Red gown", link: "https://www.revolve.com/collections/gowns" })), "Not a product page");
  assert.equal(reason(row({ price: null, source: "lens", store: "Meshki", title: "Hilda Embellished Strapless Maxi Dress - White | MESHKI US" })), null);
});

test("foreign storefronts are dropped", () => {
  assert.equal(reason(row({ price: null, source: "lens", store: "Max Mara KSA", title: "Manuela Icon Coat" })), "Store outside the US");
  assert.equal(reason(row({ price: null, source: "lens", store: "Ubuy Ecuador", title: "Tapata Womens Bodysuit" })), "Store outside the US");
  assert.equal(reason(row({ price: null, source: "lens", store: "Rakuten Fashion - 楽天市場", title: "Mulberry – 【マルベリー公式】ベイズウォーター" })), "Store outside the US");
  assert.equal(reason(row({ price: null, source: "lens", store: "Mitsukoshi", store_domain: "isetan.mistore.jp", title: "Bag" })), "Store outside the US");
  assert.equal(reason(row({ price: 200, store: "Club L London", store_domain: "clubllondon.us", title: "Alina White Bandeau Maxi Dress" })), null);
});
