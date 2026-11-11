# DAICE-Chain Glossary

**Package**
A single unit of AI documentation: a folder (typically zipped) containing `daice.json` (the canonical package data), an `assets/` folder holding review-friendly media proxies for the referenced assets (see "Assets/ media formats" below), and, optionally, a static `index.html` viewer. Typically one vendor delivery documenting many assets (see "Flight / delivery" below), not a single shot. A package is already self-contained and distributable — there is no separate "bundle" concept layered on top of it.

**Asset**
One documented thing within a package — usually a media file (image, video, or audio). Every asset is a flat entry in the package's `assets` array, with a unique `id`, regardless of how many assets the package documents or how deep its reference chains go. A non-AI input (a camera plate, licensed stock, a style board) is also an asset — one with `aiGenerated: false` — not a separate kind of thing. All of an asset's fields — including generation details (`prompt`, `generatedBy`, `generatedAt`) and its media file (`mediaPath`, `mediaMimeType`) — live directly on the asset object; there is no nested `generation` or `media` sub-object.

**Contact**
The `{ name, email? }` object used for `package.createdBy` and asset `generatedBy`. Named `contact`, not `person`, because it represents a person **or an organisation** equally well — `name` is often a company name (e.g. the delivering vendor), not an individual's. `name` is required; `email` is recommended (`SHOULD`) but not required. See `spec/README.md` §2.4.

**`assets/` media formats**
Files in the package's `assets/` folder are review and handoff proxies, not full production or mastering deliveries. A writer SHOULD limit them to PNG, JPEG, MP4, MOV, WAV, or MP3, and SHOULD NOT include OpenEXR, ProRes, or other high-data production formats. Formats outside that list are left to the exporting implementer's judgment; readers are not required to validate `assets/` file formats. See `spec/README.md` §3.

**Why `assets` is an array, not a map**
`assets` is an array of objects, each with its own `id`, rather than a map from `id` to asset. This looks redundant but is deliberate: JSON parsers silently collapse duplicate keys in an object before a validator can see them, so a map could not reliably detect a duplicate asset `id`. An array preserves every entry, so a validator can compare `id`s across it and reject duplicates explicitly. See `spec/README.md` §1 for the full rationale, including why this has no cost at scale.

**`aiGenerated` flag**
A boolean on every asset stating whether it was produced by an AI generation process. `false` is a deliberate, explicit statement that an asset is not AI-generated, allowing a lineage chain to terminate in verifiably non-AI material.

**Documentation level**
`package.documentationLevel`: `detailed` (the default; per-asset provenance and lineage) or `simplified` (which AI tools were used, and by whom, with no per-asset documentation). Which level a delivery needs is agreed outside the package. See `spec/README.md` §0.

**Tool**
One entry of the top-level `tools` array: a provider/model pair used for the work a package covers, optionally with the contacts who used it (`usedBy`). Required (at least one) in a simplified package; optional in a detailed one. See `spec/README.md` §2.6.

**Declaration**
An entry of the top-level `declarations` array: who declared (`declaredBy`), when (`declaredAt`), and a list of statements they agreed to about the conditions under which AI tools were used. Independent of the documentation level; optional (MAY) at both. See `spec/README.md` §2.7.

**Statement**
One item of a declaration: `{ id, text }`. Every listed statement was agreed to. `text` is the exact, authoritative wording, so a package explains itself without an external catalog; the `id`'s issuer prefix (`<issuer>:<key>`) groups statements by the policy they come from. The specification defines no statements; they are agreed between the parties outside the package.

**Reference**
A link from one asset to another asset in the same package that was used to create it: `{ "assetId": "...", "label": "..." }`. There is only one kind of reference — non-AI inputs are assets, not a separate reference type. The same asset MAY be referenced by more than one other asset. A writer SHOULD include review media (`mediaPath`) for a referenced asset whenever it can be obtained, but a referenced asset with no `mediaPath` — documented only through its other fields, `label`, and `metadata` — is fully conformant when media isn't available (e.g. licensed stock, or a client-held source file). See `spec/README.md` §2.3 and §2.5.

**Lineage / lineage chain**
The graph produced by starting at one asset and recursively following its references. Because a shared input asset can be referenced by more than one downstream asset, this is a directed acyclic graph, not necessarily a tree. Unfolding the lineage chain of an asset shows every AI-generated and non-AI input that contributed to it, at every step.

**Flight / delivery**
A vendor's individual shipment of a package. A vendor typically sends multiple packages over time; each is self-contained and standalone. There is no cross-package linking in the specification — packages are related only by convention, such as the package `packageName` or a `metadata` key like `flight`.

**Provider**
The asset's `provider` field: the AI generation service or pipeline used, e.g. a named cloud platform or a local render setup. Free text.

**`daiceVersion`**
The specification version a `daice.json` file conforms to. Implementations must refuse to load a file with an unrecognized version rather than guessing.

**Timecode in / timecode out**
A recommended (`SHOULD`) pair of fields on an asset, `timecodeIn` and `timecodeOut`, giving the asset's placement in the **final delivered show's timeline** as SMPTE-style `HH:MM:SS:FF`. If either is present, both MUST be present. An asset carrying both timecodes is understood to have been used in the final show; an asset without them is not, as far as the package itself is concerned. There is no separate `usedInShow` boolean — a client that needs to distinguish "confirmed cut" from "never reviewed" tracks that in their own system after import, not in the DAICE-Chain file.

**Round-trip**
The property that a package can be imported, edited (including with no changes at all), and re-exported without losing any specification-defined field or `metadata` value. This obligation applies only to tools that choose to re-export; a tool that only ever consumes a package (e.g. ingesting it into its own database) has no round-trip obligation.

**Viewer**
An OPTIONAL, self-contained, **read-only** display that a package MAY include as `index.html`. A viewer can load, validate, and display a package — as a metadata header, a table of assets, and a lineage view — and nothing more: it cannot edit a package, convert it to another format (PDF, spreadsheet, or otherwise), or re-package it. When present, it works fully offline, with no server and no DAICE-Chain tooling installed, and has no round-trip obligation because it never writes anything (see conformance §4). A package with no `index.html` at all is just as conformant as one that includes a viewer — the viewer is a convenience, never a requirement. A viewer is also scoped to just its own package: it MUST automatically load and render only the `daice.json`/`assets/` (or inline data) it ships alongside, never doubling as a general tool for opening arbitrary DAICE-Chain packages — the only exception being a narrow, one-time file-picker fallback for `file://`, where browsers block automatic local-file reads.

**Editor**
A tool, distinct from and not shipped inside a package as its viewer, that can **read and write** packages: create one from scratch, import an existing one, edit it, and re-export it. Because an editor writes, it is bound by the round-trip requirement (see conformance §3) in a way a viewer never is. Any capability that produces output beyond display — PDF or spreadsheet export, package assembly, editing — is editor-class functionality (or belongs to some other separate tool), never the viewer's.

**Conformant implementation**
Any tool — regardless of language, stack, or whether it is part of this repository — that satisfies the requirements in [`conformance.md`](conformance.md).
