/**
 * Static verification of editor-bridge push payload shape — no server required.
 * Run from repo root: node demo/magnific-chrome-extension/test/push-payload-check.mjs
 */

import { assetSchema } from "@leoninestudios/daice-chain-core";
import { buildPushPayload } from "../editor-bridge.js";
import { finalizeFragment, creationToDraft } from "../magnific.js";
import { folderListing, owner } from "./fixtures.magnific-api.mjs";

let failures = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ok  — ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  — ${label}`);
  }
}

const listingItem = folderListing[0];
const draft = creationToDraft(listingItem.creation, { owner, listingItem });
draft.mediaPath = `assets/${draft.id}.png`;
draft.mediaMimeType = "image/png";
const fragment = finalizeFragment(draft);

const captures = new Map([
  [
    "cap-1",
    {
      fragment,
      hasMedia: true,
      mimeType: "image/png",
    },
  ],
]);

const payload = buildPushPayload(captures);

check("payload has one asset", payload.assets.length === 1);
check("payload lists media ref", payload.media?.length === 1 && payload.media[0].assetId === fragment.id);

const validation = assetSchema.safeParse(payload.assets[0]);
check("asset validates against assetSchema", validation.success);

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll push-payload checks passed.");
