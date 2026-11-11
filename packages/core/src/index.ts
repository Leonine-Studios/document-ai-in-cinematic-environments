export type {
  Contact,
  DaiceVersion,
  DocumentationLevel,
  DaiceTool,
  DaiceStatement,
  DaiceDeclaration,
  PackageMetadata,
  DaiceReference,
  DaiceAsset,
  DaicePackage,
  ValidationError,
  ValidationResult,
  LineageNode,
  TableRow,
} from "./types.js";

export {
  DAICE_VERSIONS,
  CURRENT_DAICE_VERSION,
  contactSchema,
  documentationLevelSchema,
  toolSchema,
  statementSchema,
  declarationSchema,
  packageMetadataSchema,
  referenceSchema,
  assetSchema,
  daicePackageSchema,
} from "./schema.js";

export { validatePackage } from "./validate.js";
export { resolveLineage } from "./lineage.js";
export { flattenForTable } from "./flatten.js";
export { documentationLevelOf, deriveToolsFromAssets, upgradeToCurrentVersion } from "./levels.js";
