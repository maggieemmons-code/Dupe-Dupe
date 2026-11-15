/** Reading whether a result is still for sale. Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageAvailable, offersAvailable } from "../lib/server/stock";

test("a page that says sold out with no way to buy is sold out", () => {
  assert.equal(pageAvailable("Penelope Backless Satin Gown $298 SOLD OUT Notify me when it's back"), false);
});

test("a page with Add to bag is in stock, even if one size is sold out", () => {
  assert.equal(pageAvailable("Hover Knee High Boot $100 Size 6 sold out Size 7 Add to bag"), true);
});

test("a page that says neither can't tell", () => {
  assert.equal(pageAvailable("Hover Knee High Boot $100 Black leather"), null);
});

test("Google's store offers", () => {
  assert.equal(offersAvailable(["In stock online", "Free delivery"]), true);
  assert.equal(offersAvailable(["Out of stock online"]), false);
  assert.equal(offersAvailable([]), null);
});
