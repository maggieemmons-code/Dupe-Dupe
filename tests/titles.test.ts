import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle } from "../lib/titles";

// Real titles from the test set's results (Nov 15).
test("the store's own name and slogans come off either end", () => {
  assert.equal(cleanTitle("Alina – White Bandeau Maxi-Dress With Cape – Club L London – USA", "Club L London"), "Alina – White Bandeau Maxi-Dress With Cape");
  assert.equal(cleanTitle("Hilda Embellished Strapless Maxi Dress – White | MESHKI US", "meshki us"), "Hilda Embellished Strapless Maxi Dress – White");
  assert.equal(cleanTitle("Portia and Scarlett Arya Gown Dress – Buy Designer Gowns", "The Dress Warehouse."), "Portia and Scarlett Arya Gown Dress");
  assert.equal(cleanTitle("Rubaiyat – Velvet off-shoulder evening dress – red", "rubaiyat.com"), "Velvet off-shoulder evening dress – red");
});

test("a brand that isn't the store stays", () => {
  assert.equal(cleanTitle("Bridal Laelia gown in white – Emilia Wickstead", "Mytheresa"), "Bridal Laelia gown in white – Emilia Wickstead");
});

test("prefixes and category trails come off", () => {
  assert.equal(cleanTitle("Amazon.com: Women's Faux Leather Belted Coat", "Amazon"), "Women's Faux Leather Belted Coat");
  assert.equal(cleanTitle("Clothing: Maxi Dresses: 'Persephone' Ivory Strapless Maxi Dress", "House of CB"), "'Persephone' Ivory Strapless Maxi Dress");
});

test("ALL CAPS is calmed", () => {
  assert.equal(cleanTitle("WOMEN'S LONG COAT", "X"), "Women's Long Coat");
  assert.equal(cleanTitle("MOTF PU LEATHER PATCHWORK FAUX FUR COLLAR BELTED COAT FOR WOMEN", "MOTF"), "Motf Pu Leather Patchwork Faux Fur Collar Belted Coat For Women");
});

test("never empties a title", () => {
  assert.equal(cleanTitle("Club L London", "Club L London"), "Club L London");
  assert.equal(cleanTitle("", "x"), "");
});
