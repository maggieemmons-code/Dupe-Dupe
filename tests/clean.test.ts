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
test("hidden stores are dropped", () => assert.equal(reason(row({}), { ...ctx, hiddenStores: [{ name: "Nordstrom", domain: "" }] }), "Hidden store"));

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

test("another piece from the original's brand is dropped", () => {
  const sei = { ...ctx, brand: "The Sei", styleName: "Halter Drape Bias Gown", budget: 640 };
  assert.equal(reason(row({ price: 400, store: "Revolve", title: "The Sei Cowl Bias Gown In Slate Blue" }), sei), "From the original's own brand");
  const mm = { ...ctx, brand: "Max Mara", styleName: "Poldo", budget: 1134 };
  assert.equal(reason(row({ price: 800, store: "Nordstrom", title: "S Max Mara Esturia Wool Coat" }), mm), "From the original's own brand");
  const bb = { ...ctx, brand: "Bronx and Banco", styleName: "Florentina" };
  assert.equal(reason(row({ price: 200, store: "Revolve", title: "Bronx Banco Lola Gown" }), bb), "From the original's own brand");
  // Brand words scattered through a title aren't the brand.
  const moa = { ...ctx, brand: "Mother of All", styleName: "Amaya" };
  assert.equal(reason(row({ price: 200, store: "Nordstrom", title: "Mother of the Bride Gown for All Seasons" }), moa), null);
});

test("link sites aren't stores", () => {
  assert.equal(reason(row({ store: "Editorialist", store_domain: "editorialist.com" })), "Not a store");
  assert.equal(reason(row({ store: "Lyst", store_domain: "lyst.com" })), "Not a store");
});

test("resale listings are dropped from new dupes", () => {
  assert.equal(reason(row({ title: "Safiyaa Wedding Dress Save 49%" })), "Used or resale listing");
  assert.equal(reason(row({ title: "Pre-owned Strapless Gown" })), "Used or resale listing");
});

test("a piece costing as much as the original is dropped", () => {
  assert.equal(reason(row({ price: 300 }), { ...ctx, budget: null, retailPrice: 300 }), "Costs as much as the original");
});

test("one product at several stores merges", () => {
  const a = row({ title: "Commando Women's Classic Oxford Shirt Bodysuit - White - Size S", price: 238, store: "Saks Fifth Avenue" });
  const b = row({ title: "women's classic oxford shirt bodysuit - white", price: 238, store: "Reversible" });
  const out = cleanCandidates([a, b], { ...ctx, budget: 300, priceFloor: null });
  assert.ok(out.some((x) => x.duplicate_of));
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

test("one style name at the same price merges", () => {
  const a = row({ title: "Cassie Knee High Boot", price: 150, store: "Nordstrom" });
  const b = row({ title: "Women's Cassie Boots", price: 149.95, store: "Nordstrom Rack" });
  const out = cleanCandidates([a, b], { ...ctx, budget: 300, priceFloor: null });
  assert.ok(out.some((x) => x.duplicate_of));
});

// Nov 15: no-price cards that slipped through (NOTES.md › No-price cards).
test("rentals by address, link sites and more foreign storefronts are dropped", () => {
  assert.equal(
    reason(row({ price: null, source: "lens", store: "ONS Boutique", store_domain: "onsboutique.com.au", title: "Nookie - Majesty Gown", link: "https://onsboutique.com.au/nookie-dress-hire/majesty-gown" })),
    "Rental, not for sale",
  );
  assert.equal(reason(row({ price: null, source: "lens", store: "ShopLook", store_domain: "shoplook.io", title: "Tapata Womens Bodysuit" })), "Not a store");
  assert.equal(reason(row({ price: null, source: "lens", store: "Celestino", store_domain: "celestino.gr", title: "Bodysuit shirt in white" })), "Store outside the US");
  assert.equal(reason(row({ price: null, source: "lens", store: "Skroutz", store_domain: "skroutz.mt", title: "Dress" })), "Store outside the US");
  assert.equal(reason(row({ price: 120, store: "Hire Street", store_domain: "hirestreetstore.com", title: "Linen shirt", link: "https://hirestreetstore.com/products/linen-shirt" })), null);
});

test("stores blocked for everyone are dropped", () => {
  const c = { ...ctx, blockedStores: [{ name: "The Dress Outlet", domain: "thedressoutlet.com" }] };
  assert.equal(reason(row({ store: "The Dress Outlet", store_domain: "" }), c), "Blocked store");
  assert.equal(reason(row({}), c), null);
});

