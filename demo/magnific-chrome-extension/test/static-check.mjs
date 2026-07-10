/**
 * Static verification of magnific.js's mapping logic — no browser, no
 * network. Runs real (recorded) Magnific API response shapes through
 * creationToDraft/wireReferences/finalizeFragment and validates the result
 * against @leoninestudios/daice-chain-core's own `assetSchema` (the same Zod schema the editor
 * uses), per the plan's "Acceptance for this draft".
 *
 * Run from the repo root: node demo/magnific-chrome-extension/test/static-check.mjs
 */

import { assetSchema } from "@leoninestudios/daice-chain-core";
import {
  creationToDraft,
  dedupeDraftsByIdentifier,
  ensureUniqueIds,
  wireReferences,
  finalizeFragment,
  extensionForMime,
  findUploadMediaUrl,
  extractMagnificSeed,
  findSeedInMetadata,
  mediaIdFromUrl,
} from "../magnific.js";
import {
  folderListing,
  videoFamilyCreations,
  imageFamilyCreations,
  klingFamilyCreations,
  owner,
} from "./fixtures.magnific-api.mjs";

let failures = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ok  — ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  — ${label}`);
  }
}

function simulateMediaDownload(draft, mimeType) {
  // Stands in for magnific.js's downloadMedia(), which needs a real network
  // call — everything else in finalizeDraftsWithMedia() is exercised here.
  draft.mediaMimeType = mimeType;
  draft.mediaPath = `assets/${draft.id}.${extensionForMime(mimeType)}`;
}

function buildFragments() {
  const listingByIdentifier = new Map(folderListing.map((item) => [item.creation.identifier, item]));
  const mimeByIdentifier = new Map([
    ["kLuCmZG16B", "video/mp4"],
    ["627SC39iJO", "image/png"],
    ["kLuC4Kc16B", "image/png"],
    ["Uyrgge1wny", "video/mp4"],
  ]);

  const drafts = dedupeDraftsByIdentifier([
    ...videoFamilyCreations.map((creation) =>
      creationToDraft(creation, {
        owner,
        listingItem: listingByIdentifier.get(creation.identifier),
        folderListing,
        familyCreations: videoFamilyCreations,
      }),
    ),
    ...imageFamilyCreations.map((creation) =>
      creationToDraft(creation, {
        owner,
        listingItem: listingByIdentifier.get(creation.identifier),
        folderListing,
        familyCreations: imageFamilyCreations,
      }),
    ),
    ...klingFamilyCreations.map((creation) =>
      creationToDraft(creation, {
        owner,
        listingItem: listingByIdentifier.get(creation.identifier),
        folderListing,
        familyCreations: klingFamilyCreations,
      }),
    ),
    // Simulate a duplicate upload draft without listing media — should be dropped.
    creationToDraft(imageFamilyCreations[0], { owner, folderListing, familyCreations: imageFamilyCreations }),
  ]);

  check(
    "dedupeDraftsByIdentifier collapses duplicate creation identifiers",
    drafts.filter((d) => d._magnific.identifier === "627SC39iJO").length === 1,
  );
  check(
    "dedupeDraftsByIdentifier keeps the draft with listing media for uploads",
    drafts.find((d) => d._magnific.identifier === "627SC39iJO")?.metadata?.sourceUrl?.includes("real-screenshot"),
  );

  ensureUniqueIds(drafts);
  wireReferences(drafts);

  for (const draft of drafts) {
    // Mirrors finalizeDraftsWithMedia()'s real branching: no sourceUrl means
    // no download attempt, so mediaPath must stay unset — this is exactly
    // the condition that silently dropped media for uploads before listing
    // items were made available for them.
    if (draft.metadata.sourceUrl) {
      simulateMediaDownload(draft, mimeByIdentifier.get(draft._magnific.identifier) || "application/octet-stream");
    }
  }

  return { drafts, fragments: drafts.map(finalizeFragment) };
}

console.log("Building fragments from recorded Magnific API fixtures…\n");

console.log("Upload reference URL resolution (no listing row):");
const uploadCreation = imageFamilyCreations[0];
const refOnlyDraft = creationToDraft(uploadCreation, {
  owner,
  folderListing,
  familyCreations: imageFamilyCreations,
});
check(
  "upload without listingItem resolves sourceUrl via folder references",
  refOnlyDraft.metadata.sourceUrl?.includes("real-screenshot"),
);
check(
  "findUploadMediaUrl matches video img2 reference URL",
  findUploadMediaUrl(uploadCreation, folderListing, imageFamilyCreations)?.includes("real-screenshot"),
);
if (refOnlyDraft.metadata.sourceUrl) {
  simulateMediaDownload(refOnlyDraft, "image/png");
  check("upload without listingItem would set mediaPath after download", Boolean(refOnlyDraft.mediaPath));
}
console.log();

const { drafts, fragments } = buildFragments();

console.log(`Produced ${fragments.length} fragment(s):`);
for (const fragment of fragments) {
  console.log(`  - ${fragment.id} (aiGenerated: ${fragment.aiGenerated})`);
}
console.log();

console.log("Schema validation (@leoninestudios/daice-chain-core assetSchema, additionalProperties: false):");
for (const fragment of fragments) {
  const result = assetSchema.safeParse(fragment);
  check(`"${fragment.id}" validates as a DaiceAsset`, result.success);
  if (!result.success) {
    for (const issue of result.error.issues) {
      console.error(`        ${issue.path.join(".")}: ${issue.message}`);
    }
  }
}
console.log();

const video = fragments.find((f) => f.mediaPath?.endsWith(".mp4"));
const upload = fragments.find((f) => f.aiGenerated === false);
const duckImage = fragments.find((f) => f.aiGenerated && f.mediaPath?.endsWith(".png"));

console.log("Field-mapping expectations:");
check("video fragment exists", Boolean(video));
check("upload fragment exists and is aiGenerated: false", Boolean(upload));
check("duck image fragment exists", Boolean(duckImage));

if (upload) {
  check("upload has no provider/model/prompt/generatedBy/generatedAt", 
    upload.provider === undefined && upload.model === undefined && upload.prompt === undefined &&
    upload.generatedBy === undefined && upload.generatedAt === undefined);
  check("upload id derived from its filename", upload.id === "real-screenshot");
  check(
    "upload has media resolved from the folder listing's download_url (regression: uploads used to have none)",
    Boolean(upload.mediaPath),
  );
}

if (duckImage) {
  check("duck image generatedBy is the logged-in Magnific account", 
    duckImage.generatedBy?.name === "Da Pe" && duckImage.generatedBy?.email === "danilo.pejakovic@leoninestudios.com");
  check("duck image seed parsed to an integer (360495)", duckImage.seed === 360495);
  check(
    "duck image auto-wires a reference to the upload via imageReferences",
    Array.isArray(duckImage.references) &&
      duckImage.references.some((ref) => ref.assetId === upload?.id && ref.label === "canvas-original"),
  );
  check("duck image model comes from its slug", duckImage.model === "seedream-4-5");
}

if (video) {
  check("video generatedBy is the logged-in Magnific account", 
    video.generatedBy?.name === "Da Pe" && video.generatedBy?.email === "danilo.pejakovic@leoninestudios.com");
  check(
    "video has no integer seed (live API verified: Seedance video metadata has no seed field)",
    video.seed === undefined,
  );
  check(
    "video wires copied-media refs to duck render and real-screenshot upload",
    video.references.length === 2 &&
      video.references.some((ref) => ref.assetId === duckImage?.id && ref.label === "img1") &&
      video.references.some((ref) => ref.assetId === upload?.id && ref.label === "img2"),
  );
  check(
    "video's copied media references are preserved under metadata for provenance",
    Array.isArray(video.metadata?.magnificMediaReferences) && video.metadata.magnificMediaReferences.length === 2,
  );
  check("video model comes from its slug", video.model === "bytedance-seedance-pro-2.0");
}

const kling = fragments.find((f) => f.model === "kling-omni3");
console.log("Field-mapping expectations (Kling, metadata.keyframes shape):");
check("kling video fragment exists", Boolean(kling));
if (kling) {
  check(
    "kling has no integer seed (live API verified: no video model exposes a seed field)",
    kling.seed === undefined,
  );
  check(
    "kling wires start_frame/end_frame keyframes to duck render and real-screenshot upload via filename-stem match",
    kling.references.length === 2 &&
      kling.references.some((ref) => ref.assetId === duckImage?.id && ref.label === "start_frame") &&
      kling.references.some((ref) => ref.assetId === upload?.id && ref.label === "end_frame"),
  );
  check(
    "kling's keyframe references are preserved under metadata for provenance",
    Array.isArray(kling.metadata?.magnificMediaReferences) && kling.metadata.magnificMediaReferences.length === 2,
  );
}

console.log();
console.log("Seed extraction:");
check(
  "extractMagnificSeed reads duck image metadata.seed",
  extractMagnificSeed(imageFamilyCreations[1].metadata) === 360495,
);
check(
  "extractMagnificSeed finds no seed on recorded Seedance video metadata",
  extractMagnificSeed(videoFamilyCreations[0].metadata) === undefined,
);
check(
  "findSeedInMetadata deep scan finds no seed on live-shaped Seedance video metadata",
  findSeedInMetadata(videoFamilyCreations[0].metadata) === undefined,
);
check(
  "merged listing+family metadata still yields no video seed",
  extractMagnificSeed({
    ...folderListing[0].creation.metadata,
    ...videoFamilyCreations[0].metadata,
  }) === undefined,
);
check(
  "mediaIdFromUrl parses production id from reference URLs",
  mediaIdFromUrl(videoFamilyCreations[0].metadata.references[1].url) === 4821211268,
);

console.log();
console.log("Thumbnail resolution (UI-only, never part of the exported fragment):");
const videoDraft = drafts.find((d) => d._magnific.identifier === "kLuCmZG16B");
const uploadDraft = drafts.find((d) => d._magnific.identifier === "627SC39iJO");
const imageDraft = drafts.find((d) => d._magnific.identifier === "kLuC4Kc16B");
check(
  "video draft's thumbnail is the listing's poster frame, not the .mp4 itself",
  videoDraft?._magnific.thumbnailUrl?.includes("start_frame.jpg"),
);
check(
  "upload draft's thumbnail comes from its own listing item (regression: uploads used to have none)",
  Boolean(uploadDraft?._magnific.thumbnailUrl),
);
check("image draft's thumbnail resolves to something displayable", Boolean(imageDraft?._magnific.thumbnailUrl));

if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("All checks passed.");
}
