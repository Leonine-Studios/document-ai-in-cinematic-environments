# DAICE-Chain — Document AI in Cinematic Environments

DAICE-Chain is an open specification and reference implementation for documenting how AI-generated media assets were made, including any AI-generated or non-AI assets that were used to create them.

It exists because AI-assisted media production is now common in film, video, and audio pipelines, but there has been no shared, portable way to answer a simple question after the fact: **what was used to create this, and how?** DAICE-Chain answers that question with a small, nested data structure and a package format that anyone can open, read, and archive — no special software required.

## Why DAICE-Chain

- **Transparent chains, not black boxes.** An asset can reference the other assets (AI-generated or not) that were used to create it. Unfolding those references recursively gives a full lineage, from the final deliverable back to its raw inputs.
- **Portable packages.** A DAICE-Chain package is a self-contained folder (or `.zip`) — `daice.json` plus an `assets/` folder is a complete, conformant package on its own. A package MAY also include a static `index.html` viewer that behaves like a small offline website: open it in a browser — no server, no database, no DAICE-Chain tooling installed — to read the documentation as a single collapsible table, where each asset's references unfold as nested rows in place (its lineage), rather than a separate table and lineage view. That viewer, when present, is deliberately read-only; converting to PDF/Excel or editing a package is the job of a separate editor tool, never the optional viewer.
- **Implementation-neutral.** The specification is deliberately independent of any particular tool, vendor, or platform. This repository ships a proof-of-concept editor and one integration example, but the specification is the primary deliverable: any team can implement it on their own.

## What's in this repository

| Path | What it is |
|------|------------|
| [`spec/`](spec/) | The specification only: human-readable spec, JSON Schema, conformance rules, and glossary. The normative artifact at v0.1.0 — no example packages or tooling live here |
| [`packages/core/`](packages/core/) | `@daice-chain/core` — TypeScript types, Zod validators, lineage resolution, and table flattening shared by every tool in this repo |
| [`demo/`](demo/) | Everything that shows the specification in action — illustrative, and free to change independently of `spec/` (see `demo/`'s own layout below) |
| [`demo/viewer/`](demo/viewer/) | The static, read-only HTML viewer that a package MAY optionally include (see "Viewer" vs. "Editor" in [`spec/glossary.md`](spec/glossary.md)). Self-contained plain JS with no build step and no `@daice-chain/core` dependency, versioned independently (`VIEWER_VERSION` in `viewer.js`, shown in its own UI), and designed to be copy/pasted as-is into your own export pipeline |
| [`demo/examples/`](demo/examples/) | A reference example package (`demo-package/`, viewer included) and deliberately-invalid fixtures (`invalid/`) used by `@daice-chain/core`'s own test suite |
| [`demo/editor/`](demo/editor/) | A proof-of-concept editor (Vite + React) for authoring, importing, and exporting DAICE-Chain packages. Not intended for production use — it exists to prove the specification is implementable and to generate demo packages |
| [`demo/magnific-chrome-extension/`](demo/magnific-chrome-extension/) | A Chrome extension example that captures generation metadata from the Magnific web app and hands it to the editor, showing how a real platform can feed DAICE-Chain |

## The specification, in short

A **package** (`daice.json`) is typically one vendor delivery: minimal top-level metadata (a contract/administrative title, who created it, when, contact details) and a flat list of **assets** — often dozens to hundreds of them, each with its own nested lineage. Every field lives directly on the asset object — there's no nested `generation` or `media` sub-object. Each asset carries:

- `provider`, `model`, `generatedBy`, and `generatedAt` — required when `aiGenerated` is `true`, plus `prompt`, which is recommended in the same case but MAY be omitted (for example, when a vendor can't disclose a proprietary or trade-secret prompt)
- an `aiGenerated` flag (set to `false` to explicitly document that an asset is *not* AI-generated — a camera plate or stock image is just an asset with this flag set, not a separate kind of thing)
- `mediaPath` / `mediaMimeType` pointing at the asset's file within the package — recommended for every asset, including one that's only referenced as another asset's input, but not required: a referenced asset with no obtainable media is still fully documented through its other fields
- `references`: zero or more links to the other assets in the same package that were used to create it
- optional `timecodeIn`/`timecodeOut` (placement in the final show's timeline) — an asset carrying both is understood to have made the final cut; there's no separate boolean for this, it's inferred from the timecodes being present

`createdBy` and `generatedBy` are both a `contact` object (`{ name, email? }`) — named `contact`, not `person`, because it's just as often a company (e.g. the delivering vendor) as it is an individual.

Because references point to other entries in the same `assets` list, a package captures a full directed lineage graph — the same input can be shared by multiple downstream assets — not just a flat record or a single tree. See [`spec/README.md`](spec/README.md) for the full normative specification.

## Package layout

```
my-package.daice.zip
├── daice.json        # canonical package data
├── assets/          # referenced media files — review proxies, not production deliveries
└── index.html      # OPTIONAL static viewer — open this in any browser
```

`assets/` holds review and handoff proxies (PNG, JPEG, MP4, MOV, WAV, MP3) rather than production-grade deliverables — a writer SHOULD NOT ship EXR, ProRes, or similar high-data formats there. See [`spec/README.md`](spec/README.md) §3.

## Status

This is a proof-of-concept implementation of DAICE-Chain v0.1.0 — the first public pre-release of the specification and reference tooling, ready for use and open for discussion. The specification in [`spec/`](spec/) is the normative artifact; the editor and extension are illustrative and may change independently.

## Stewardship

DAICE-Chain was created by **Nova Unit**, part of **Leonine Studios**, part of **Mediawan Group**.

Nova Unit maintains this repository and the v0.1.0 specification as a proof-of-concept and reference implementation. The specification is the primary deliverable; the editor, viewer, and extension examples exist to show that it is implementable.

## Collaboration

As with every open specification, we are looking for others to **share the burden** — or to **embrace** DAICE-Chain in their own pipelines and tools.

Collaboration is welcome: feedback on the spec, conformant implementations, integrations with real production workflows, and co-stewardship of future versions. Open an issue or pull request to start a conversation.

## License

See [`LICENSE`](LICENSE).
