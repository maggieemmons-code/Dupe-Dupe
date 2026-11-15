/** Tool replies that arrive as text are turned back into data. Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseToolInput } from "../lib/agents/parseToolInput";

test("an object sent as JSON text becomes an object", () => {
  assert.deepEqual(parseToolInput({ visual_brief: JSON.stringify({ anchors: [{ id: "a" }] }) }), { visual_brief: { anchors: [{ id: "a" }] } });
});

test("JSON quoted twice still becomes an object", () => {
  assert.deepEqual(parseToolInput({ v: JSON.stringify(JSON.stringify({ anchors: [1] })) }), { v: { anchors: [1] } });
});

test("JSON with words around it becomes an object", () => {
  assert.deepEqual(parseToolInput({ v: 'Here: {"anchors":[2]} done' }), { v: { anchors: [2] } });
});

test("ordinary text is left alone", () => {
  assert.deepEqual(parseToolInput({ brand: "Saint Laurent", composition: "100% polyester" }), { brand: "Saint Laurent", composition: "100% polyester" });
});

test("objects that are already data pass through", () => {
  const input = { picks: [{ n: 1 }] };
  assert.deepEqual(parseToolInput(input), input);
});

test("JSON missing its last closing brace is repaired", () => {
  const text = '{"sheen":"soft","anchors":[{"id":"toe","label":"Pointed square toe","dealbreaker":true}]';
  assert.deepEqual(parseToolInput({ visual_brief: text }), {
    visual_brief: { sheen: "soft", anchors: [{ id: "toe", label: "Pointed square toe", dealbreaker: true }] },
  });
});
