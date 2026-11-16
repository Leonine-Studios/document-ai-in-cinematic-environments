# @leoninestudios/daice-chain-core

TypeScript types, validation, lineage resolution, and table flattening for [DAICE-Chain](https://github.com/Leonine-Studios/document-ai-in-cinematic-environments) packages. This package implements specification v0.2.0. The normative text is `spec/` in that repository.

```sh
npm install @leoninestudios/daice-chain-core
```

## Validate a package

`validatePackage` never throws. A v0.1.0 package is valid. A package that uses `documentationLevel`, `tools`, or `declarations` must be labelled `"0.2.0"`.

```ts
import { validatePackage } from "@leoninestudios/daice-chain-core";

const result = validatePackage(JSON.parse(daiceJson));
if (!result.valid) {
  for (const error of result.errors) {
    console.error(error.path, error.message);
  }
} else {
  console.log(result.package.package.packageName);
}
```

## Documentation level

`"detailed"` is the default when `package.documentationLevel` is missing. `"simple"` documents which AI tools were used, and requires `tools` with at least one entry.

```ts
import {
  documentationLevelOf,
  deriveToolsFromAssets,
  upgradeToCurrentVersion,
} from "@leoninestudios/daice-chain-core";

documentationLevelOf(pkg); // "detailed" | "simple"
deriveToolsFromAssets(pkg); // one tool per distinct provider/model on AI assets
upgradeToCurrentVersion(pkg); // relabels daiceVersion as "0.2.0"; nothing else changes
```

## Also exported

- `resolveLineage` walks an asset's references.
- `flattenForTable` turns that walk into rows for a table.
- The Zod schemas (`daicePackageSchema` and the piece schemas) and the types (`DaicePackage`, `DaiceTool`, `DaiceDeclaration`, and the rest) are exported for writers that build a package rather than only read one.
