import { test } from "node:test";
import assert from "node:assert/strict";
import { detailPhrases } from "../lib/search/catalogPhrases";

// Real anchors from the test set (Nov 15).
test("one phrasing per signature detail: shade, detail, garment word", () => {
  const out = detailPhrases(
    {
      color: "Black",
      color_name: "black",
      visual_brief: { anchors: [{ label: "Big plush faux fur shawl collar" }, { label: "Matching deep faux fur cuffs" }] },
    },
    ["faux leather belted coat fur collar"],
  );
  assert.deepEqual(out, ["black big plush faux fur shawl collar", "black matching deep faux fur cuffs collar"]);
});

test("a shade already in the detail isn't repeated; the color family's first word stands in for a missing shade name", () => {
  const out = detailPhrases(
    { color: "Burgundy / Wine", color_name: null, visual_brief: { anchors: [{ label: "deep burgundy velvet" }] } },
    ["burgundy velvet strapless corset gown"],
  );
  assert.deepEqual(out, ["burgundy deep velvet gown"]);
});

test("at most 3, none when there are no anchors", () => {
  assert.deepEqual(detailPhrases({ color: "Blue", visual_brief: null }, ["blue dress"]), []);
  const many = detailPhrases(
    { color: "Red", visual_brief: { anchors: [{ label: "a" }, { label: "b" }, { label: "c" }, { label: "d" }] } },
    ["red dress"],
  );
  assert.equal(many.length, 3);
});
