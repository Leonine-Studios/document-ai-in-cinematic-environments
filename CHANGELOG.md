# Changelog

## 0.2.0

Adds a documentation level, a list of AI tools, and declarations. The change is additive: every 0.1.0 package stays valid, and a reader that implements 0.2.0 must also accept 0.1.0.

- `package.documentationLevel` is `"detailed"` (the default when the field is missing) or `"simple"`. A simple package documents which AI tools were used, and by whom, and needs no per-asset documentation.
- `tools` lists provider/model pairs, optionally with the contacts who used each one. A simple package must have at least one. A detailed package may include the list.
- `declarations` records who agreed to which statements, and when. A statement is `{ id, text }`. The specification defines no statements; `text` is the wording that was agreed to.
- `daiceVersion` is `"0.1.0"` or `"0.2.0"`. A writer must use `"0.2.0"` as soon as the package uses any of the new fields. A package labelled `"0.1.0"` must not contain them.
- `@leoninestudios/daice-chain-core` adds `documentationLevelOf`, `deriveToolsFromAssets`, and `upgradeToCurrentVersion`.

## 0.1.0

First public pre-release. A package is `daice.json` plus optional review media: package metadata, a flat list of assets, and references that form a lineage.
