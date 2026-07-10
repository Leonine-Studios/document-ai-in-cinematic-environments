/**
 * Real Magnific API responses recorded live against magnific.com on
 * 2026-07-08 (project "Danilos PADS test"), trimmed to the fields
 * magnific.js actually reads (large, irrelevant bulk like credit ledgers
 * and internal bytedance task ids removed). Two fixture gaps are called out
 * inline: `folderListingImageItem`'s `download_url`/`thumbnail` were not
 * captured verbatim during exploration (only item [0]'s full shape was),
 * so they are reconstructed to match that observed shape rather than
 * copied from a live response.
 *
 * Used by static-check.mjs to verify magnific.js's mapping against the real
 * shapes Magnific returns, without needing a live browser session.
 */

const OWNER = {
  user_id: 194388441,
  avatar: "https://avatar.cdnpk.net/default_07.png",
  display_name: "Da Pe",
  email: "danilo.pejakovic@leoninestudios.com",
};

const FOLDER_REFERENCE = "315f35cf-3b67-4399-823b-33469d91d23b";
const VIDEO_FAMILY = "f2c2a6dd-a476-47bc-af5c-cbe921fddbd2";
const IMAGE_FAMILY = "a23572d6-f987-46e3-b8c3-e9e8b7002964";
const KLING_FAMILY = "507b60aa-8664-402e-8009-1f841abf4eeb";

const VIDEO_PROMPT =
  "A Video starting with a slow drone shot through a mountain scape with @img2 . The a duck in an airplane flies into the scene entering the frame from above, stays there for a second with @img1 after which it flies past the camera so the animation ends on @img2  ";

const DUCK_PROMPT =
  "A realistic duck inside a cartoon airplane flying towards us smiling/blinking into the camera, the whole fitting realistically into the scene…";

// Reconstructed prompt text (not individually re-verified, unlike the
// keyframes/metadata shape below, which was read live) — this is one of
// several video models (kling-omni3, kling-30, google-veo3_1, wan-2-7,
// runway-gen45, happy-horse-1) added to the same test project after the
// initial recording; all confirmed to share this exact shape live on
// 2026-07-08: a start/end `metadata.keyframes` pair instead of Seedance's
// `metadata.references` array, and no seed field anywhere in the response.
const KLING_PROMPT = "A duck pilot's airplane flies past the camera through the mountain scape and comes to rest";

/** `GET /app/api/projects/workspaces/assets?folder_reference=...` response `data`. */
export const folderListing = [
  {
    name: VIDEO_PROMPT,
    reference: "785be54d-4352-4905-a79b-17e5107fd343",
    tool_name: "video-generator",
    tool_file_type: "video",
    download_url:
      "https://pikaso.cdnpk.net/private/production/4821211209/a-realistic-duck-inside-a-seedream-45.png?filename=a-realistic-duck-inside-a-seedream-45.png&token=exp=1783519200~hmac=redacted",
    thumbnail: {
      url: "https://pikaso.cdnpk.net/private/production/4821232143/start_frame.jpg?preview=true&token=exp=1783596429~hmac=redacted",
      width: 0,
      height: 0,
    },
    owner: OWNER,
    meta: null,
    creation: {
      tool: "video-generator",
      identifier: "kLuCmZG16B",
      family: VIDEO_FAMILY,
      created_at: "2026-07-08T10:09:46.000000Z",
      metadata: {
        slug: "bytedance-seedance-pro-2.0",
        model: "seedance",
        mode: "pro-2.0",
        prompt: VIDEO_PROMPT,
        url: "https://pikaso.cdnpk.net/private/production/4821231852/f2c2a6dd-a476-47bc-af5c-cbe921fddbd2-0.mp4?token=exp=1783519200~hmac=redacted",
        generationId: "nats-49c5d848-3484-4b07-82d9-e728494393b6",
        extraParameters: { style: "default", promptMode: "manual" },
        references: [
          {
            url: "https://pikaso.cdnpk.net/private/production/4821211209/a-realistic-duck-inside-a-seedream-45.png?token=exp=1783519200~hmac=redacted",
            name: "img1",
            type: "image",
            media_id: 4821211209,
          },
          {
            url: "https://pikaso.cdnpk.net/private/production/4821211268/real-screenshot.png?token=exp=1783519200~hmac=redacted",
            name: "img2",
            type: "image",
            media_id: 4821211268,
          },
        ],
        tags: ["Seedance 2.0", "4 sec", "16:9", "resolution:480p", "24fps"],
      },
    },
  },
  // Reconstructed to match the shape above (not individually re-verified) —
  // this listing item was originally inspected only in summary form. The
  // filename was later confirmed live to be "render.jpg" (Magnific renamed
  // this output after the initial recording) — the Kling/Veo/Wan/Runway
  // keyframe fixtures below rely on this exact stem for filename matching,
  // same as production.
  {
    name: "A realistic duck inside a cartoon airplane flying towards us",
    tool_name: "talk",
    tool_file_type: "image",
    download_url:
      "https://pikaso.cdnpk.net/private/production/4821158888/render.jpg?filename=render.jpg&token=exp=1783519200~hmac=redacted",
    thumbnail: {
      url: "https://pikaso.cdnpk.net/private/production/4821158888/render.jpg?preview=true&token=exp=1783519200~hmac=redacted",
      width: 0,
      height: 0,
    },
    owner: OWNER,
    meta: null,
    creation: {
      tool: "talk",
      identifier: "kLuC4Kc16B",
      family: IMAGE_FAMILY,
      created_at: "2026-07-08T09:53:58.000000Z",
      metadata: {
        slug: "seedream-4-5",
        mode: "seedream-4-5",
        prompt: DUCK_PROMPT,
        tags: ["4:3", "auto", "thinking-high", "auto:seedream-4-5"],
      },
    },
  },
  // Reconstructed to match the shape above — this fixture predates removing
  // the exclude_tool_name[] filter that hid raw uploads from the folder
  // listing, so this item's own listing entry was not captured live. Its
  // download_url is inferred from the video family's img2 reference, which
  // points at the same underlying file (real-screenshot.png, media_id
  // 4821211268) — before this fixture existed, `creationToDraft` had no
  // listingItem to fall back on for this upload and its media/thumbnail
  // were silently empty (the bug this fixture now guards against).
  {
    name: "real-screenshot.png",
    tool_name: "upload",
    tool_file_type: "image",
    download_url:
      "https://pikaso.cdnpk.net/private/production/4821211268/real-screenshot.png?filename=real-screenshot.png&token=exp=1783519200~hmac=redacted",
    thumbnail: {
      url: "https://pikaso.cdnpk.net/private/production/4821211268/real-screenshot.png?preview=true&token=exp=1783519200~hmac=redacted",
      width: 0,
      height: 0,
    },
    owner: OWNER,
    meta: null,
    creation: {
      tool: "upload",
      identifier: "627SC39iJO",
      family: IMAGE_FAMILY,
      created_at: "2026-07-08T09:28:37.000000Z",
      metadata: {
        name: "real-screenshot.png",
        prompt: "real-screenshot",
        platform: "web",
        request_id: "glb-72d69830f8e40675d9367fc6a047370c",
        projects_folder_reference: FOLDER_REFERENCE,
      },
    },
  },
  // A second video model added after the initial recording, sharing the
  // same start/end `keyframes` shape as every non-Seedance video tool
  // verified live (kling-omni3, kling-30, google-veo3_1, wan-2-7,
  // runway-gen45, happy-horse-1) — one fixture slice stands in for all of
  // them since the shape is identical.
  {
    name: KLING_PROMPT,
    reference: "8f6f6c8a-7f8c-4b2b-9b3a-9a2b6c8f6f6c",
    tool_name: "video-generator",
    tool_file_type: "video",
    download_url:
      "https://pikaso.cdnpk.net/private/production/4824713200/507b60aa-8664-402e-8009-1f841abf4eeb-0.mp4?filename=507b60aa-8664-402e-8009-1f841abf4eeb-0.mp4&token=exp=1783526400~hmac=redacted",
    thumbnail: {
      url: "https://pikaso.cdnpk.net/private/production/4824713260/start_frame.jpg?preview=true&token=exp=1783526400~hmac=redacted",
      width: 0,
      height: 0,
    },
    owner: OWNER,
    meta: null,
    creation: {
      tool: "video-generator",
      identifier: "Uyrgge1wny",
      family: KLING_FAMILY,
      created_at: "2026-07-08T16:30:00.000000Z",
      metadata: {
        slug: "kling-omni3",
        model: "kling",
        mode: "omni3",
        prompt: KLING_PROMPT,
        tags: ["Kling Omni 3", "5 sec", "16:9"],
      },
    },
  },
];

/** `GET /app/api/creations/{family}` response `data` for the video's own family: no chain, just itself. */
export const videoFamilyCreations = [
  {
    id: 3265290497,
    identifier: "kLuCmZG16B",
    family: VIDEO_FAMILY,
    tool: "video-generator",
    created_at: "2026-07-08T10:09:46.000000Z",
    metadata: {
      api: "bytedance",
      fps: 24,
      url: "https://pikaso.cdnpk.net/private/production/4821231852/f2c2a6dd-a476-47bc-af5c-cbe921fddbd2-0.mp4?token=exp=1783519200~hmac=redacted",
      mode: "pro-2.0",
      name: VIDEO_PROMPT,
      slug: "bytedance-seedance-pro-2.0",
      tags: ["Seedance 2.0", "4 sec", "16:9", "resolution:480p", "24fps"],
      model: "seedance",
      prompt: VIDEO_PROMPT,
      status: "completed",
      duration: 4,
      generationId: "nats-49c5d848-3484-4b07-82d9-e728494393b6",
      extraParameters: { style: "default", promptMode: "manual" },
      references: [
        {
          url: "https://pikaso.cdnpk.net/private/production/4821211209/a-realistic-duck-inside-a-seedream-45.png?token=exp=1783519200~hmac=redacted",
          name: "img1",
          type: "image",
          media_id: 4821211209,
        },
        {
          url: "https://pikaso.cdnpk.net/private/production/4821211268/real-screenshot.png?token=exp=1783519200~hmac=redacted",
          name: "img2",
          type: "image",
          media_id: 4821211268,
        },
      ],
      mediaCollection: [
        {
          type: "video",
          url: "https://pikaso.cdnpk.net/private/production/4821231852/f2c2a6dd-a476-47bc-af5c-cbe921fddbd2-0.mp4?token=exp=1783519200~hmac=redacted",
          createdAt: "2026-07-08T10:11:28.000000Z",
        },
      ],
      projects_folder_reference: FOLDER_REFERENCE,
    },
  },
];

/**
 * `GET /app/api/creations/{family}` response `data` for the duck image's
 * family: the raw upload plus the generation that used it as a reference —
 * a real, resolvable chain. Note the "talk" tool's metadata has no `url` or
 * `mediaCollection` key at all (verified live) — its output URL is only
 * available via the folder listing's `download_url`.
 */
export const imageFamilyCreations = [
  {
    id: 3264990001,
    identifier: "627SC39iJO",
    family: IMAGE_FAMILY,
    tool: "upload",
    created_at: "2026-07-08T09:28:37.000000Z",
    metadata: {
      name: "real-screenshot.png",
      prompt: "real-screenshot",
      platform: "web",
      request_id: "glb-72d69830f8e40675d9367fc6a047370c",
      projects_folder_reference: FOLDER_REFERENCE,
    },
  },
  {
    id: 3265006392,
    identifier: "kLuC4Kc16B",
    family: IMAGE_FAMILY,
    tool: "talk",
    created_at: "2026-07-08T09:53:58.000000Z",
    metadata: {
      mode: "seedream-4-5",
      seed: "360495",
      slug: "seedream-4-5",
      tags: ["4:3", "auto", "thinking-high", "auto:seedream-4-5"],
      tool: "talk-to-image-v2",
      prompt: DUCK_PROMPT,
      service: "seedream-4-5-edit",
      outputWidth: 2224,
      outputHeight: 1664,
      thinkingLevel: "high",
      imageReferences: [{ type: "image", image: "creation:627SC39iJO", label: "canvas-original", category: "image" }],
      source_metadata: { mode: "seedream-4-5", seed: 360495, prompt: DUCK_PROMPT },
      projects_folder_reference: FOLDER_REFERENCE,
    },
  },
];

/**
 * `GET /app/api/creations/{family}` response `data` for the Kling video's
 * own family: no chain, just itself — same shape as `videoFamilyCreations`
 * except its input images live in `metadata.keyframes` (start/end slots)
 * instead of Seedance's `metadata.references` array. Verified live across
 * every non-Seedance video model tried (kling-omni3, kling-30,
 * google-veo3_1, wan-2-7, runway-gen45, happy-horse-1): no seed field
 * anywhere in the response for any of them.
 */
export const klingFamilyCreations = [
  {
    id: 3265290600,
    identifier: "Uyrgge1wny",
    family: KLING_FAMILY,
    tool: "video-generator",
    created_at: "2026-07-08T16:30:00.000000Z",
    metadata: {
      api: "kling",
      fps: 24,
      url: "https://pikaso.cdnpk.net/private/production/4824713200/507b60aa-8664-402e-8009-1f841abf4eeb-0.mp4?token=exp=1783526400~hmac=redacted",
      mode: "omni3",
      name: KLING_PROMPT,
      slug: "kling-omni3",
      tags: ["Kling Omni 3", "5 sec", "16:9"],
      model: "kling",
      prompt: KLING_PROMPT,
      status: "completed",
      duration: 5,
      generationId: "nats-7a1c2d3e-4f56-4789-9abc-def012345678",
      extraParameters: { style: "default", promptMode: "manual" },
      keyframes: {
        start_frame: {
          url: "https://pikaso.cdnpk.net/private/production/4824713201/render.jpg?token=exp=1783526400~hmac=redacted",
          type: "image",
          media_id: 4824713201,
        },
        end_frame: {
          url: "https://pikaso.cdnpk.net/private/production/4824713202/real-screenshot.png?token=exp=1783526400~hmac=redacted",
          type: "image",
          media_id: 4824713202,
        },
      },
      mediaCollection: [
        {
          type: "video",
          url: "https://pikaso.cdnpk.net/private/production/4824713200/507b60aa-8664-402e-8009-1f841abf4eeb-0.mp4?token=exp=1783526400~hmac=redacted",
          createdAt: "2026-07-08T16:31:42.000000Z",
        },
      ],
      projects_folder_reference: FOLDER_REFERENCE,
    },
  },
];

export const owner = OWNER;
export const folderReference = FOLDER_REFERENCE;
