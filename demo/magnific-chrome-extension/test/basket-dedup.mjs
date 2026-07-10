/**
 * Static verification of basket-dedup.js — no browser required.
 * Run from repo root: node demo/magnific-chrome-extension/test/basket-dedup.mjs
 */

import {
  magnificKey,
  findCaptureIdByMagnificIdentifier,
  usedFragmentIds,
  ensureUniqueFragmentId,
  rewireIncomingFragmentReferences,
  summarizeCaptureResults,
} from "../basket-dedup.js";

let failures = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ok  — ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  — ${label}`);
  }
}

function makeFragment(id, magnificIdentifier, references = []) {
  return {
    id,
    aiGenerated: true,
    prompt: id,
    references,
    metadata: { magnificIdentifier },
  };
}

function makeCaptures(entries) {
  const map = new Map();
  for (const [captureId, fragment] of entries) {
    map.set(captureId, { fragment });
  }
  return map;
}

console.log("basket-dedup.mjs");

check("magnificKey reads identifier", magnificKey(makeFragment("a", "cre-1")) === "cre-1");

const captures = makeCaptures([
  ["cap-1", makeFragment("hero", "cre-1")],
  ["cap-2", makeFragment("other", "cre-2", [{ assetId: "hero" }])],
]);

check(
  "findCaptureIdByMagnificIdentifier finds existing",
  findCaptureIdByMagnificIdentifier(captures, "cre-1") === "cap-1",
);
check("usedFragmentIds collects ids", usedFragmentIds(captures).has("hero"));

const unique = ensureUniqueFragmentId(makeFragment("hero", "cre-3"), new Set(["hero"]));
check("ensureUniqueFragmentId suffixes clash", unique.renamed && unique.fragment.id === "hero-2");

const rewired = rewireIncomingFragmentReferences(
  { ...captures.get("cap-2").fragment, references: [{ assetId: "hero" }] },
  "hero",
  "hero-2",
);
check(
  "rewireIncomingFragmentReferences updates only the incoming fragment",
  rewired.references[0].assetId === "hero-2" && captures.get("cap-2").fragment.references[0].assetId === "hero",
);

const singleReplace = summarizeCaptureResults([{ action: "replaced" }]);
check(
  "summarize single replace warns",
  singleReplace.variant === "warn" && singleReplace.message.includes("replaced"),
);

const batch = summarizeCaptureResults([
  { action: "new" },
  { action: "new" },
  { action: "replaced" },
  { action: "replaced" },
]);
check(
  "summarize batch with updates",
  batch.variant === "warn" && batch.message.includes("2 new") && batch.message.includes("2 updated"),
);

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll basket-dedup checks passed.");
