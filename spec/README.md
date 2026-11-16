# DAICE-Chain Specification v0.2.0

This is the normative specification for DAICE-Chain (Document AI in cinematic environments). v0.2.0 is the current version. v0.1.0 was the first public pre-release; every v0.1.0 package remains valid (see §6). This document is intended to be understandable on its own, without reading any code. The machine-readable version of everything below lives in `[schema/daice.schema.json](schema/daice.schema.json)` and MUST stay consistent with this document — if you change one, change the other in the same commit.

Key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119): they describe requirement levels for implementations, not this document's own writing style.

Stewardship and collaboration: see the root [README.md](../README.md#stewardship).

## 0. What a package is

A DAICE-Chain package is typically **one vendor delivery**, not one shot: it documents every AI asset a vendor produced for a contract — commonly dozens to hundreds — each with its own recursively nested chain of sub-assets, all the way down to non-AI source material. A vendor sends **multiple packages over time** ("flights" or deliveries); each package is self-contained and standalone, related to the others only by convention (its `packageName`, or a `metadata` key such as `flight`), never by cross-package links.

Two parties typically interact with a package:

- The **vendor (producer)** authors the provenance — every asset's `provider`, `model`, `references`, and, when it can be shared, `prompt` — as the deliverable is produced. The vendor usually does not know or decide the final cut, so it typically does not add show timecodes.
- The **client (consumer)** imports the delivered package. From there, either is valid:
  - **Consume-only** — ingest the package into the client's own database, archive, or media asset manager, and track final-cut usage there. There is no re-export. This is a complete, conformant use of DAICE-Chain: the format's job was just to deliver the documentation.
  - **Re-export** — annotate inside the package (for example, add `timecodeIn`/`timecodeOut` to the assets that made the final cut) and re-issue it, e.g. for an internal archive or a further downstream handoff. This is a **round-trip** (see §5): the tool that does this MUST preserve every field it doesn't touch.

Nothing in the schema distinguishes these flows — a package looks the same either way. This section only explains the intended use; §5 states the conformance rule that follows from it.

### Documentation levels

A package is written at one of two documentation levels:

- **Detailed** (the default): the package documents each AI asset individually — provider, model, who generated it and when, the prompt where it can be shared, and its lineage. This is the v0.1.0 model, unchanged.
- **Simple**: the package documents which AI tools were used for the work it covers, and by whom. It needs no per-asset documentation; it answers "who used what", not "how was each asset made".

Which level a delivery needs is agreed between the parties outside the package, for example in the contract. A simple package is not an unfinished detailed package; it is complete at its level. A recipient MAY accept a detailed package where only a simple one is required.

Declarations (§2.7) are independent of the level: detailed provenance neither replaces nor implies a declaration.

## 1. Concepts

- **Package** — a single unit of AI documentation: a folder (typically zipped) containing one `daice.json` manifest, an `assets/` folder holding review-friendly media proxies for the assets it refers to (see §3), and, optionally, a static `index.html` viewer (see §3). A package is already self-contained and distributable on its own — there is no separate "bundle" concept layered on top of it. A package documents any number of assets and everything traceable that was used to create them.
- **Asset** — one documented thing: usually a media file (an image, video, or audio file), but conceptually any output that can be described with a prompt, a model, and a creator. Every asset in a package is listed once, flat, in the package's `assets` array. A non-AI input (a camera plate, a licensed stock image, a style reference board) is also an asset — one with `aiGenerated: false` — not a separate kind of thing.
- **Reference** — a link from one asset to another asset in the same package that was used to create it. Because every input is itself an asset, there is only one kind of reference.
- **Lineage / lineage chain** — the graph obtained by starting at one asset and recursively following its references. Because references point to other entries in the same `assets` array rather than duplicating them, the same input asset can be referenced by more than one downstream asset (it is a directed acyclic graph, not necessarily a tree). Unfolding a lineage chain shows exactly what was used, at every step, to arrive at a given asset.
- **Documentation level** — `detailed` (per-asset provenance, the default) or `simple` (which AI tools were used, and by whom). See §0.
- **Tool** — one provider/model pair used for the work in a package, optionally with who used it. See §2.6.
- **Declaration** — a set of statements a party has agreed to about the conditions under which AI tools were used (for example, that no tool trains on the input data). See §2.7.
- `aiGenerated` **flag** — every asset declares whether it was produced by AI. Setting it to `false` is a deliberate, explicit statement that nothing about that particular asset was AI-generated; it exists so a lineage chain can terminate in verifiably non-AI material.

See `[glossary.md](glossary.md)` for a compact definition list.

### Why `assets` is an array, not a map keyed by `id`

Each asset carries its own `id`, and it might look redundant for the package to *also* store assets in an array (rather than as a map from `id` to asset, which would give O(1) lookup for free). This is deliberate, not an oversight: JSON parsers silently collapse duplicate keys in an object before any validator ever sees the data — a second entry with the same key simply overwrites the first, with no error and no trace. A map representation would therefore make it impossible to reliably detect a duplicate asset `id` (a case this specification treats as a hard validation error; see §4). An array preserves every entry exactly as written, so an implementation can compare `id` fields across elements and raise a proper, path-scoped error.

This costs nothing at scale: any implementation that wants O(1) lookup by `id` can build one in memory in a single pass when it loads the package (for example, a `Map` from `id` to asset), whether the package has a hundred assets or a million. The file format does not need to be a map for an implementation's in-memory representation to be one.

## 2. The `daice.json` file

A package's canonical data lives in exactly one file, `daice.json`, at the root of the package. There is one manifest per package, not one file per asset — every asset, no matter how deep in the lineage, is an additional entry in the same flat `assets` array, connected by `references`.

### 2.1 Top level


| Field          | Type                    | Requirement | Description                                                                                                                                                                                                        |
| -------------- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `daiceVersion` | string, `"0.1.0"` or `"0.2.0"` | MUST        | The specification version this file conforms to. A writer MUST use `"0.2.0"` as soon as the file uses `documentationLevel`, `tools`, or `declarations`. |
| `package`      | object                  | MUST        | Package-level metadata. See §2.2.                                                                                                                                                                                  |
| `tools`        | array of tool objects   | MUST if `package.documentationLevel` is `"simple"` (at least one entry); otherwise MAY | The AI tools used for the work this package covers. See §2.6. Requires `daiceVersion` `"0.2.0"`. |
| `declarations` | array of declaration objects | MAY | Statements a party agreed to about how the tools were used. See §2.7. Requires `daiceVersion` `"0.2.0"`. |
| `assets`       | array of asset objects  | MUST        | Every documented asset in the package, flat, however many there are. MAY be empty — for a package that documents nothing yet, or a simple package that documents tools only. See "Why `assets` is an array" above. |


Implementations MUST refuse to load a `daice.json` whose `daiceVersion` they do not recognize (for example, a future `"2.0"`), rather than guessing at compatibility. This is a safety property, not a strictness-for-its-own-sake rule: silently misinterpreting a newer format is worse than refusing to open it.

### 2.2 `package` — package metadata

Deliberately minimal, per the specification's design goal of not overloading the top level with fields that belong on individual assets.


| Field         | Type                       | Requirement | Description                                                                                                                                                                                                                                                                                            |
| ------------- | -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`          | string                     | MUST        | A unique identifier for this package. A UUID is RECOMMENDED but any unique string is valid.                                                                                                                                                                                                            |
| `packageName` | string                     | MUST        | An administrative or contractual identifier for this package — it ties the delivery to a vendor, contract, or purchase order, not to a creative description. Free text, e.g. `"vendorxyz_contract123"` or `"acme_PO-4471_ep03-delivery"`.                                                              |
| `description` | string                     | MAY         | An optional human-readable description of this package's contents or context, distinct from the contractual `packageName`.                                                                                                                                                                             |
| `documentationLevel` | `"detailed"` or `"simple"` | MAY | The documentation level (see §0). A missing value means `"detailed"`. Requires `daiceVersion` `"0.2.0"`. |
| `createdAt`   | string, ISO 8601 date-time | MUST        | When this package was assembled/exported (packaging time) — not when the assets inside it were generated.                                                                                                                                                                                              |
| `createdBy`   | contact object             | MUST        | The package creator: a person or an organisation (for example, the delivering vendor). This is the single point of contact for the package — there is no separate contact-email field; use `createdBy.email`. See §2.4.                                                                                |
| `metadata`    | object                     | MAY         | Free-form extension data for fields this specification doesn't define. Implementations MUST preserve unknown `metadata` keys verbatim when they re-export a package (see §5, round-trip). A common, non-normative convention is a `flight` or `delivery` key to relate a vendor's successive packages. |




### 2.3 `assets[]` — asset objects

Every field an asset needs lives directly on the asset object — there is no separate nested object for generation details or for the media file. This keeps a hand-authored asset a single flat block, and keeps the conditional rule ("these fields are required only when `aiGenerated` is `true`") a single, easy-to-state list rather than something split across nested objects.


| Field           | Type                       | Requirement                                       | Description                                                                                                                                                                                                                                                                                          |
| --------------- | -------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | string                     | MUST                                              | Unique within this package's `assets` array. RECOMMENDED to derive from the asset's media filename (e.g. `"hero-final"` for `hero-final.jpg`), appending a short disambiguating suffix if that would collide with another asset's `id`. A human-readable slug is fine — a UUID is not required here. |
| `aiGenerated`   | boolean                    | MUST                                              | Whether this asset was produced by an AI generation process.                                                                                                                                                                                                                                         |
| `provider`      | string                     | MUST if `aiGenerated` is `true`; otherwise unused | The generation provider, e.g. a named AI content-generation service or local pipeline. Free text, e.g. `"Magnific"`, `"Local (ComfyUI)"`.                                                                                                                                                             |
| `model`         | string                     | MUST if `aiGenerated` is `true`; otherwise unused | The model or model version used, e.g. a named model variant. Free text.                                                                                                                                                                                                                                |
| `prompt`        | string                     | SHOULD if `aiGenerated` is `true`; otherwise unused | The prompt (or equivalent generation instruction) used. An empty string is valid for generations with no text prompt (e.g. an image-to-image transform with no text guidance). `prompt` MAY be omitted entirely even when `aiGenerated` is `true` — a vendor MAY have a legitimate reason not to disclose it (for example, a proprietary or trade-secret prompt); omission is a deliberate relaxation from an earlier, stricter draft of this specification and is fully conformant. |
| `generatedBy`   | contact object             | MUST if `aiGenerated` is `true`; otherwise unused | Who ran the generation. See §2.4. MAY differ from the package's `createdBy` — the person or organisation that ran a specific generation is not necessarily the one who assembled the package, which is why this is a separate field rather than reusing `package.createdBy`.                          |
| `generatedAt`   | string, ISO 8601 date-time | MUST if `aiGenerated` is `true`; otherwise unused | When the generation happened. Distinct from `package.createdAt` (packaging time).                                                                                                                                                                                                                    |
| `seed`          | integer                    | MAY                                               | The generation seed, when the provider/model exposes one and it was recorded. Optional even when `aiGenerated` is `true` — omit when unknown, not applicable, or not exposed by the generation process.                                                                                              |
| `mediaPath`     | string                     | SHOULD                                            | Path to the asset's media file, relative to the package root. MUST start with `assets/`, e.g. `assets/asset-root.jpg`, when present. A package (§3) MUST have a resolvable `mediaPath` for every asset that has one.                                                                                 |
| `mediaMimeType` | string                     | SHOULD                                            | The file's MIME type, e.g. `image/jpeg`, `video/mp4`, `audio/wav`. See §3 for the review-friendly formats a writer SHOULD limit `assets/` to; v0.1.0 does not enforce a closed list at the schema level.                                                                                               |
| `references`    | array of reference objects | MUST                                              | Links to the other assets in this package that were used to create this one. MAY be empty for a leaf asset. See §2.5.                                                                                                                                                                                |
| `timecodeIn`    | string, `HH:MM:SS:FF`      | SHOULD                                            | Where this asset starts in the **final delivered show's timeline**. See below.                                                                                                                                                                                                                       |
| `timecodeOut`   | string, `HH:MM:SS:FF`      | SHOULD                                            | Where this asset ends in the final delivered show's timeline, paired with `timecodeIn`. See below.                                                                                                                                                                                                   |
| `metadata`      | object                     | MAY                                               | Free-form extension data, preserved verbatim on re-export, same as package-level `metadata`.                                                                                                                                                                                                         |


When `aiGenerated` is `false`, `provider`, `model`, `prompt`, `generatedBy`, and `generatedAt` are not applicable and SHOULD be omitted. An implementation MUST NOT require them in that case.

**Media for referenced assets.** Every asset that appears in another asset's `references` SHOULD include `mediaPath` (and `mediaMimeType`) when review media can be obtained — a lineage is far more useful to a reviewer when every step in it can actually be viewed. When media cannot be included, for any reason (licensed stock the vendor cannot redistribute, a client-held plate, an NDA, a source file that no longer exists, and so on), the asset MUST still be listed in `assets` and referenced; the writer omits `mediaPath` and documents whatever is known instead — `aiGenerated`, generation fields when applicable, a descriptive `reference.label` (see §2.5), or a `metadata` note. A metadata-only referenced asset, with no `mediaPath` at all, is fully conformant: the point of a reference is to record that an input existed and what is known about it, not to guarantee a viewable file ships alongside it.

**Timecodes (**`timecodeIn` **/** `timecodeOut`**) and "used in the show".** These describe where an asset was placed in the **final show's timeline** — not an in/out point within the asset's own source clip. Format is SMPTE-style `HH:MM:SS:FF` (hours, minutes, seconds, frames); frame rate is out of band and not captured in v0.1.0. Both fields are RECOMMENDED (SHOULD), but if either is present the other MUST also be present — a package MUST NOT have one without the other.

There is no separate boolean field for "this asset was used in the final show" — **an asset with both timecodes present is understood to have been placed in the show; an asset without them is not**, from the package's point of view. DAICE-Chain does not distinguish, within the file itself, between "confirmed cut from the show" and "never reviewed" — both simply have no timecodes. A client that needs that distinction (for example, to prove that all documented-but-unused material was actively reviewed rather than just never looked at) SHOULD track it in their own system after import, consistent with DAICE-Chain being a delivery format rather than a required system of record (see §0).

### 2.4 `contact` — a name and, optionally, a contact email

Used for `package.createdBy` and asset `generatedBy`. Represents a person **or an organisation** — the field is named `contact`, not `person`, precisely because it is just as often a company (for example, the delivering vendor) as it is an individual.


| Field   | Type   | Requirement | Description                                 |
| ------- | ------ | ----------- | ------------------------------------------- |
| `name`  | string | MUST        | Display name of the person or organisation. |
| `email` | string | SHOULD      | Contact email address.                      |

A common pattern is to put the studio or vendor company in `package.createdBy` and the individual artist or operator who ran a given generation in that asset's `generatedBy` — though a package MAY use the same company contact for both, or an individual for `createdBy`, if that better reflects who is actually accountable.




### 2.5 `reference` — a link to another asset

Every reference points to another asset in the same package's `assets` array. There is only one kind of reference — non-AI inputs are documented as assets with `aiGenerated: false`, not as a separate reference type.


| Field     | Type   | Requirement | Description                                                            |
| --------- | ------ | ----------- | ---------------------------------------------------------------------- |
| `assetId` | string | MUST        | Must match the `id` of another asset in this package's `assets` array. |
| `label`   | string | MAY         | A short human description of this reference, e.g. `"style board"`. Especially useful when the referenced asset has no `mediaPath` (see §2.3, "Media for referenced assets") — a `label` such as `"licensed stock — Getty #12345"` describes what the input was even when no review file is included. |


An asset reference MUST NOT create a cycle (an asset MUST NOT, directly or indirectly through its references, reference itself). Implementations MUST detect cycles during validation and treat them as an error (see §4). The same asset MAY be referenced by more than one other asset — this is expected and is why the lineage is a graph, not necessarily a tree.

### 2.6 `tools[]` — AI tools used

One entry per provider/model pair used for the work this package covers — the same two notions an asset carries as `provider` and `model`.

| Field      | Type            | Requirement | Description |
| ---------- | --------------- | ----------- | ----------- |
| `provider` | string          | MUST        | The AI service or pipeline, same meaning as an asset's `provider`. Free text, e.g. `"Magnific"`, `"Local (ComfyUI)"`. |
| `model`    | string          | MUST        | The model or model version, same meaning as an asset's `model`. Free text. |
| `usedBy`   | array of contacts | MAY       | Who used this tool (§2.4). When omitted, `package.createdBy` is understood to be the user. |
| `metadata` | object          | MAY         | Free-form extension data, preserved verbatim on re-export. |

- A package SHOULD list each provider/model pair only once. Readers MAY merge duplicates.
- In a **simple** package, `tools` is the documentation itself and MUST contain at least one entry.
- In a **detailed** package, `tools` MAY be present to list the tools used.

### 2.7 `declarations[]` — declarations and statements

A declaration is a set of statements a party agreed to about the conditions under which AI tools were used for the work in this package — for example, that no tool trains on the input data. Every statement listed in a declaration was agreed to; a statement that was not agreed to is simply not listed. Declarations complement provenance rather than replace it, and apply at both documentation levels.

**Declaration**

| Field        | Type                       | Requirement | Description |
| ------------ | -------------------------- | ----------- | ----------- |
| `declaredBy` | contact                    | MUST        | Who made the declaration (§2.4). Kept separate from `package.createdBy` because a declaration keeps its author when the package is re-exported by someone else. |
| `declaredAt` | string, ISO 8601 date-time | MUST        | When it was made. Kept separate from `package.createdAt` for the same reason. |
| `statements` | array of statements        | MUST        | At least one. |
| `metadata`   | object                     | MAY         | Free-form extension data, preserved verbatim on re-export. |

**Statement**

| Field  | Type   | Requirement | Description |
| ------ | ------ | ----------- | ----------- |
| `id`   | string | MUST        | Unique within its declaration. SHOULD be stable and prefixed by its issuer (`<issuer>:<key>`, e.g. `acme:no-training-on-inputs`), which also groups statements by the policy they come from. |
| `text` | string | MUST        | The exact, self-contained wording that was agreed to. `text` is authoritative: the same `id` MAY carry different wording in different packages, and a reader goes by the `text`. A package therefore explains itself without any external catalog. |

- **This specification defines no statements.** Which statements a declaration must contain is agreed between the parties outside the package.
- A declaration covers the package it is in. `declarations` is an array because a package can carry more than one, for example from several parties.
- Declarations are optional (MAY) at both levels. Whether a declaration is required is a policy of the receiving system, not of the format.

### 2.8 Rules per documentation level

- **Detailed:** everything as in v0.1.0. `tools` and `declarations` MAY be present.
- **Simple:** `tools` MUST be present with at least one entry. `assets` MUST still be present and MAY be empty; any assets it does include are validated exactly as in a detailed package. The `assets/` folder MAY be empty or missing when no asset has a `mediaPath` (§3). `declarations` MAY be present.

## 3. Package layout

A package is a folder, typically zipped, that is self-contained and distributable on its own — there is no separate "bundle" format layered on top of it:

```
my-package.daice.zip
├── daice.json        # canonical package data, per §2 (MUST)
├── assets/          # media files referenced by mediaPath (MUST if any asset has a mediaPath)
│   ├── asset-root.jpg
│   └── plate-review.mp4
└── index.html      # OPTIONAL static viewer — open this in any browser, no server required
```



### `assets/` media formats

Files in `assets/` are review and handoff proxies — not full production or mastering deliveries. A conformant **writer** SHOULD limit them to widely viewable formats:


| Kind  | Extensions              | Example MIME types             |
| ----- | ----------------------- | ------------------------------ |
| Image | `.png`, `.jpg`, `.jpeg` | `image/png`, `image/jpeg`      |
| Video | `.mp4`, `.mov`          | `video/mp4`, `video/quicktime` |
| Audio | `.wav`, `.mp3`          | `audio/wav`, `audio/mpeg`      |


A writer SHOULD NOT place production-grade or high-bit-depth delivery formats in `assets/` — including but not limited to OpenEXR (`.exr`), Apple ProRes, and similar VFX or mastering codecs. When the authoritative media is delivered outside the package, the package still documents it in `daice.json`; only the heavy file stays out of `assets/`.

For formats not explicitly listed above, the exporting implementer MAY judge whether a file is a production/high-data delivery (and therefore should be omitted from `assets/`) or an acceptable review proxy. Readers are not required to validate `assets/` file formats — this is writer-side guidance, not a schema constraint (see §4).

Writers SHOULD include a review proxy in `assets/` not just for an asset's own `mediaPath`, but for every referenced input whenever that media is obtainable (see §2.3, "Media for referenced assets"). A package MAY still contain assets with no `mediaPath` at all — for example, a referenced input the vendor could not redistribute — and readers MUST NOT treat a missing `mediaPath` as a validation error.

Requirements for a package:

- `daice.json` MUST be at the package root.
- Every `mediaPath` MUST resolve to a real file inside the package.
- `index.html` is OPTIONAL. A package with no viewer at all — just `daice.json` and `assets/` — is fully conformant. `[../demo/examples/demo-package/](../demo/examples/demo-package/)` ships a reference viewer (`index.html`, `viewer.css`, `viewer.js`) alongside its `daice.json` and `assets/` to double as a working example of the full package layout below; those viewer files are additive, not required — the package would remain just as conformant without them.
- If a package includes an `index.html` viewer, it MUST be fully functional with no network access, and opening it directly from the filesystem (`file://`) MUST work, in addition to being served over HTTP. Concretely, a viewer MUST NOT load or call **any** resource — script, stylesheet, font, image, media, analytics/telemetry beacon, or any `fetch`/`XHR` request — from outside the package it ships inside. Every resource it references MUST resolve to a file within that same package: its own `index.html`, its JS/CSS, `daice.json`, and `assets/`. There is no partial exception for "just a font" or "just an analytics script" — a package's viewer is fully self-contained, full stop.
- An included viewer MUST automatically load and render only the package it ships inside — its own colocated `daice.json`/`assets/`, or an inline data block — with no user interaction required whenever the runtime allows it (an inline data block, or `fetch` when served over HTTP(S)). It MUST NOT double as a general-purpose tool for opening arbitrary DAICE-Chain packages. The sole exception is `file://`, where browsers block a page from reading local files automatically: there, a viewer MAY prompt the user to select this package's own `daice.json` (and, optionally, its own `assets/` folder) as a one-time gesture required by that sandboxing — not as an invitation to browse to an unrelated package elsewhere on disk. Because opening directly from disk is the common case, a viewer SHOULD ship with the package's data already embedded in `index.html` (for example, in an inline `<script type="application/json">` block a packaging step writes at export time) so it renders immediately even over `file://`, rather than relying on the picker fallback by default.
- **A viewer's own file footprint is minimal by design.** If a package includes a viewer, it consists of exactly: `index.html`, exactly one JavaScript file (MUST — a viewer needs code to parse, validate, and render; any library it depends on, such as `@leoninestudios/daice-chain-core`, MUST be inlined into that same file rather than shipped as a separate script or folder), and, optionally, exactly one CSS file if styling cannot reasonably be inlined into `index.html`. A viewer MUST NOT bring any additional supporting files or subfolders (for example, a separate vendor library folder) beyond this set. This keeps the full package layout, viewer included, to at most `daice.json`, `assets/`, `index.html`, one JS file, and one CSS file.



## 4. Validation and malformed input

Every implementation that reads a `daice.json` — whether a viewer, an editor, or a third-party tool — MUST validate it before use and MUST fail safe on invalid input. Concretely:

- Validate structurally against `[schema/daice.schema.json](schema/daice.schema.json)` first.
- Then validate referential integrity: every `reference.assetId` MUST exist in `assets`; every asset `id` MUST be unique; there MUST be no reference cycles.
- Validate the v0.2.0 rules: a `simple` package has `tools` with at least one entry; every tool has a `provider` and a `model`; statement `id`s are unique within a declaration; and a package labelled `"0.1.0"` does not contain `documentationLevel`, `tools`, or `declarations`.
- Reject an unrecognized or newer `daiceVersion` rather than attempting best-effort interpretation.
- On any failure, report **specific, path-scoped errors** (for example, `assets[2].provider is required`, or `assets[1].references[0].assetId does not match any asset id`) rather than a generic failure message or a stack trace.
- Loading a package is **all-or-nothing**: an implementation MUST NOT partially load a package that failed validation, even if some assets look fine in isolation.

This is a conformance requirement, detailed further in `[conformance.md](conformance.md)`.

## 5. Round-trip

A package MAY be re-opened, edited, and re-exported — but, per §0, it does not have to be: a tool that only ever consumes a package (for example, ingesting it into the importer's own database or archive, with final-cut usage tracked there instead of in the file) is fully conformant without ever re-exporting anything.

**The round-trip guarantee is conditional on re-export.** Any implementation that supports editing MUST be able to import a valid package, apply zero or more edits, and re-export it such that:

- Every field defined in this specification that was not touched by an edit keeps its original value.
- Every key inside a `metadata` object — package-level or asset-level — is preserved verbatim, even though the implementation may not understand its meaning.

- `tools` and `declarations` are preserved like every other field. A re-exporting tool MUST NOT change, re-date, or remove a declaration it did not create, and MUST NOT mask its `declaredBy`; it MAY add its own. Masking a `usedBy` contact for privacy is an edit the user deliberately chose and is allowed.

A tool that never re-exports has no round-trip obligation at all.

## 6. Versioning

This document describes DAICE-Chain **v0.2.0**. `daiceVersion` in every `daice.json` MUST match a version this specification defines: `"0.1.0"` or `"0.2.0"`.

**v0.1.0 → v0.2.0** is purely additive: it adds `package.documentationLevel` (`"detailed"` or `"simple"`), `tools`, and `declarations`. The version number still changes, because v0.1.0 readers reject unknown fields and would otherwise fail with a confusing "unrecognized property" error; with a new number they refuse the file cleanly as an unknown version. Readers that support `"0.2.0"` MUST also accept `"0.1.0"`. A v0.1.0 package is read as a detailed package with no tools and no declarations. Writers MUST write `"0.2.0"` as soon as they use any new field, and MAY relabel a 0.1.0 package as 0.2.0 when re-exporting it; nothing else in it needs to change. Future minor versions of this specification MUST be additive (new optional fields) wherever possible; breaking changes require a new major `daiceVersion`.

Relaxing a requirement from MUST to SHOULD (as this document did for `prompt`, see §2.3) is a backward-compatible clarification, not a breaking change: every package that satisfied the stricter rule still satisfies the looser one, so no version change is needed for it.

## 7. Examples

### 7.1 Detailed package

See `[../demo/examples/demo-package/](../demo/examples/demo-package/)` for a complete, valid example package with more than one asset lineage, a shared (multiply-referenced) input asset, and non-AI leaves. A minimal illustrative sketch, showing one lineage from that package:

```json
{
  "daiceVersion": "0.1.0",
  "package": {
    "id": "8f14e45f-ceea-467e-bd6d-01234567890a",
    "packageName": "vendorxyz_contract123",
    "description": "Hero shot delivery for the ExampleShow pilot.",
    "createdAt": "2026-07-07T12:00:00Z",
    "createdBy": { "name": "Vendor XYZ", "email": "delivery@vendorxyz.com" },
    "metadata": { "flight": "1" }
  },
  "assets": [
    {
      "id": "asset-final",
      "aiGenerated": true,
      "provider": "Magnific",
      "model": "ExampleModel v2 Fast",
      "prompt": "cinematic wide shot, golden hour, hero walking toward camera",
      "generatedBy": { "name": "Artist One", "email": "artist@vendorxyz.com" },
      "generatedAt": "2026-07-07T11:30:00Z",
      "seed": 482913,
      "mediaPath": "assets/asset-final.jpg",
      "mediaMimeType": "image/jpeg",
      "references": [
        { "assetId": "asset-plate-upscale" },
        { "assetId": "asset-style-ref", "label": "Style reference board" },
        { "assetId": "asset-stock-ref", "label": "Background plate (licensed stock, not redistributable)" }
      ],
      "timecodeIn": "01:02:03:12",
      "timecodeOut": "01:02:07:04"
    },
    {
      "id": "asset-plate-upscale",
      "aiGenerated": true,
      "provider": "Local (ComfyUI)",
      "model": "ExampleUpscaler v1",
      "prompt": "upscale, preserve detail",
      "generatedBy": { "name": "Artist One", "email": "artist@vendorxyz.com" },
      "generatedAt": "2026-07-07T10:15:00Z",
      "mediaPath": "assets/asset-plate-upscale.jpg",
      "mediaMimeType": "image/jpeg",
      "references": [
        { "assetId": "asset-raw-plate" }
      ]
    },
    {
      "id": "asset-raw-plate",
      "aiGenerated": false,
      "mediaPath": "assets/asset-raw-plate.jpg",
      "mediaMimeType": "image/jpeg",
      "references": []
    },
    {
      "id": "asset-style-ref",
      "aiGenerated": false,
      "mediaPath": "assets/asset-style-ref.jpg",
      "mediaMimeType": "image/jpeg",
      "references": []
    },
    {
      "id": "asset-stock-ref",
      "aiGenerated": false,
      "references": [],
      "metadata": { "source": "Licensed stock — example ref 12345, not redistributable" }
    }
  ]
}
```

Unfolding `asset-final` shows exactly what produced it: an AI upscale of a raw, non-AI camera plate, a non-AI style reference asset, and a non-AI licensed stock plate — a transparent, traceable chain from final deliverable back to its origins. `asset-final` carries timecodes, so it is understood to have been placed in the final show; the assets behind it do not, since they are intermediate/leaf material rather than final-show placements. `asset-stock-ref` has no `mediaPath` at all — its licensed stock media could not be redistributed inside the package — but it is still a fully documented, fully conformant asset: its `reference.label` and `metadata` record what it was even without a viewable file. In the full demo package, `asset-style-ref` is also referenced by a second asset, illustrating that the lineage is a graph, not a tree, and that a package documents many such lineages side by side, not just one.
### 7.2 Simple package

A simple package answers "who used which AI tool" and records the declaration the vendor made. The statements below are illustrations only — this specification defines none.

```json
{
  "daiceVersion": "0.2.0",
  "package": {
    "id": "3b1f6a52-7c4d-4e0a-9f11-0a1b2c3d4e5f",
    "packageName": "vendorxyz_PO-4471_ep03",
    "documentationLevel": "simple",
    "createdAt": "2026-11-11T10:00:00Z",
    "createdBy": { "name": "Vendor XYZ GmbH", "email": "delivery@vendorxyz.com" }
  },
  "tools": [
    { "provider": "Magnific", "model": "Mystic 2.5" },
    { "provider": "Magnific", "model": "Flux Kontext" },
    { "provider": "ElevenLabs", "model": "Eleven v3", "usedBy": [{ "name": "Jane Doe" }] }
  ],
  "declarations": [
    {
      "declaredBy": { "name": "Jane Doe", "email": "jane@vendorxyz.com" },
      "declaredAt": "2026-11-11T10:05:00Z",
      "statements": [
        {
          "id": "acme:no-training-on-inputs",
          "text": "No AI tool used for this work trains on the input data provided to it."
        },
        {
          "id": "streamco:no-inference-mainland-china",
          "text": "No AI inference for this work runs in mainland China."
        }
      ]
    }
  ],
  "assets": []
}
```

Three tools were used (two models of one provider, one from another); only the third records a separate user, the others default to the package creator. The declaration carries the exact wording that was agreed to; the `id` prefixes show which policy each statement comes from. `assets` is empty because a simple package documents tools, not individual assets.
