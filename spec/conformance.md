# DAICE-Chain Conformance

This document defines what an implementation must do to be considered DAICE-Chain-conformant. It is a companion to [`README.md`](README.md) (the specification) and does not redefine any field — see the specification for field-level requirements.

There is no certification process; this is a checklist for implementers (including this repository's own editor and viewer) to self-assess against.

## 1. Reading packages

A conformant reader (viewer, editor, or any other tool that loads a `daice.json`) MUST:

1. Parse the file as JSON and validate it against [`schema/daice.schema.json`](schema/daice.schema.json).
2. Validate referential integrity beyond what JSON Schema alone can express:
   - Every `{ "assetId": ... }` reference resolves to an existing asset `id`.
   - Every asset `id` is unique within the package.
   - No reference cycle exists (no asset transitively references itself).
3. Reject any `daiceVersion` it does not implement, rather than guessing at forward or backward compatibility.
4. On any failure from steps 1–3, refuse to load the package and present **specific, path-scoped errors** (e.g. `assets[2].provider is required`) rather than a generic message, a stack trace, or a blank/broken UI.
5. Treat loading as all-or-nothing: never render or operate on a partially-valid package.

**A conformant reader is not required to re-export anything.** A tool that imports a package purely to ingest it into its own database, archive, or media asset manager — with no DAICE-Chain re-export step — satisfies conformance in full by meeting the requirements in this section. See §3 for when round-trip requirements additionally apply.

## 2. Writing / exporting packages

A conformant writer (an editor, a vendor-side authoring tool, or any tool that produces packages) MUST:

1. Only emit a `daice.json` that validates against the current schema.
2. When exporting a package, ensure every `mediaPath` resolves to an actual file inside the package's `assets/` folder. Writers SHOULD attempt to include media for every referenced asset, not just an asset's own output, whenever that media can be obtained (specification §2.3); omitting `mediaPath` on a referenced asset because the media is unavailable is not a conformance failure.
3. Produce a package that matches the layout in specification §3 (`daice.json`, `assets/`, and an OPTIONAL `index.html`). If an `index.html` viewer is included, it MUST function fully offline, loading no script, stylesheet, font, image, or other resource from outside the package — see §4.
4. SHOULD limit `assets/` to the review-friendly formats listed in specification §3 (PNG, JPEG, MP4, MOV, WAV, MP3); SHOULD NOT include EXR, ProRes, or other high-data production deliveries. Readers are not required to validate this.

This applies to a vendor authoring a brand-new package as much as it does to a client re-exporting one it imported.

## 3. Round-trip (editors and re-exporting tools only)

Round-trip is a **conditional** requirement: it applies only to a tool that imports a package and then re-exports it (edited or not). A tool that only ever consumes a package — for example, ingesting it into the importer's own system and tracking any downstream annotations (such as final-cut usage) there instead of in a DAICE-Chain file — is conformant per §1 alone and has no obligation under this section.

A conformant editor or re-exporting tool MUST be able to import a valid package, apply zero or more edits, and re-export it such that:

- Every specification-defined field not touched by an edit keeps its original value.
- Every `metadata` key, at package or asset level, is preserved verbatim even if the tool does not interpret it.

This applies whether the import is a full package (with or without an `index.html` viewer) or a bare `daice.json` plus its `assets/` folder.

## 4. Viewer-specific requirements

A viewer and an editor are distinct roles (see [`glossary.md`](glossary.md)): a **viewer** is the OPTIONAL, read-only `index.html` a package MAY include; an **editor** is a separate tool that reads and writes packages. A package is not required to include a viewer at all (see §2 and specification §3) — this section only constrains a viewer if one is present. IF a package includes an `index.html` viewer, that viewer MUST, in addition to §1:

- Render correctly when `index.html` is opened directly from the filesystem (`file://`), not only when served over HTTP.
- Never load or call any resource from outside the package it ships inside — no remote script, stylesheet, font, image, media, analytics/telemetry beacon, or `fetch`/`XHR` to any origin other than the package's own files. Every resource a viewer references MUST resolve inside the same package (see specification §3). There is no partial exception (e.g. "just a web font," "just an analytics pixel") — a viewer is fully self-contained.
- Provide a way to browse the package's assets and to inspect any asset's lineage (its unfolded reference chain). A package may document many assets (dozens to hundreds) with several independent lineages side by side; whatever UI satisfies this MUST scale to that without requiring every lineage open at once. This document does not prescribe a specific UI pattern for satisfying this (table, tree, hierarchical table, or otherwise) — see this repository's own viewer for one example approach.
- Be read-only: a viewer MUST NOT offer editing, re-export, package assembly, or conversion to another format (PDF, spreadsheet, or otherwise). These are editor-class (or other separate-tool) capabilities — see §2 and §3 — deliberately kept out of the viewer to keep it small and safe to embed, unmodified, in any package that chooses to include one.
- Automatically load and render only its own package: whenever the runtime permits it (an inline data block, or `fetch` when served over HTTP(S)), a viewer MUST load with zero user interaction. It MUST NOT present itself as a general-purpose tool for opening arbitrary DAICE-Chain packages. Over `file://`, where browsers block a page from reading local files automatically, a viewer MAY fall back to prompting the user to select this same package's own `daice.json` (and, optionally, its own `assets/` folder) — a narrow accommodation for that sandboxing, not a standing invitation to browse to an unrelated package.
- Keep its own file footprint minimal: `index.html`, exactly one JavaScript file (with any library dependency, such as `@daice-chain/core`, inlined into it — no separate vendor script or library folder), and at most one CSS file if styling isn't inlined into `index.html`. A viewer MUST NOT add any other supporting files or subfolders. See specification §3.

## 5. Extension / capture tool requirements

A tool that captures generation metadata from a third-party platform (like the Magnific integration example in this repository) and hands it off to an editor is not required to emit a full package — it MAY emit a single asset object matching specification §2.3. Whatever it emits MUST still validate as a well-formed asset object per the schema, and MUST NOT invent fields outside the specification.

## 6. What conformance does not require

- Conformance does not require using this repository's editor, viewer, or `@daice-chain/core` library. Any implementation that satisfies the rules above, in any language or stack, is conformant.
- Conformance does not require a particular UI, only the listed capabilities.
- Conformance does not require re-exporting a package. See §3.
- Conformance does not require a package to include an `index.html` viewer at all. A package consisting of only `daice.json` and `assets/` is fully conformant. See §4.
