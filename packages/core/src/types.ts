/**
 * Canonical TypeScript types for a DAICE-Chain package, matching
 * ../../../spec/schema/daice.schema.json field-for-field.
 *
 * See ../../../spec/README.md for the normative definition of every field.
 */

export interface Contact {
  name: string;
  email?: string;
}

export type DaiceVersion = "0.1.0" | "0.2.0";

export type DocumentationLevel = "detailed" | "simplified";

export interface PackageMetadata {
  id: string;
  packageName: string;
  description?: string;
  documentationLevel?: DocumentationLevel;
  createdAt: string;
  createdBy: Contact;
  metadata?: Record<string, unknown>;
}

export interface DaiceReference {
  assetId: string;
  label?: string;
}

export interface DaiceAsset {
  id: string;
  aiGenerated: boolean;
  provider?: string;
  model?: string;
  prompt?: string;
  generatedBy?: Contact;
  generatedAt?: string;
  seed?: number;
  mediaPath?: string;
  mediaMimeType?: string;
  references: DaiceReference[];
  timecodeIn?: string;
  timecodeOut?: string;
  metadata?: Record<string, unknown>;
}

export interface DaiceTool {
  provider: string;
  model: string;
  usedBy?: Contact[];
  metadata?: Record<string, unknown>;
}

export interface DaiceStatement {
  id: string;
  text: string;
}

export interface DaiceDeclaration {
  declaredBy: Contact;
  declaredAt: string;
  statements: DaiceStatement[];
  metadata?: Record<string, unknown>;
}

export interface DaicePackage {
  daiceVersion: DaiceVersion;
  package: PackageMetadata;
  tools?: DaiceTool[];
  declarations?: DaiceDeclaration[];
  assets: DaiceAsset[];
}

export interface ValidationError {
  /** Dot/bracket path to the offending field, e.g. "assets[2].prompt". */
  path: string;
  /** Human-readable message, safe to show directly to a non-technical user. */
  message: string;
}

export type ValidationResult =
  | { valid: true; errors: []; package: DaicePackage }
  | { valid: false; errors: ValidationError[]; package?: undefined };

export interface LineageNode {
  asset: DaiceAsset;
  /** Resolved nested asset references, recursively unfolded. */
  children: LineageNode[];
}

export interface TableRow {
  id: string;
  aiGenerated: boolean;
  provider: string;
  model: string;
  promptExcerpt: string;
  generatedByEmail: string;
  referenceCount: number;
  /** Derived: true iff the asset carries both timecodeIn and timecodeOut. */
  usedInShow: boolean;
}
