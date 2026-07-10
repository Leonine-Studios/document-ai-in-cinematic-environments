import type { z } from "zod";
import { assetSchema, packageMetadataSchema, contactSchema } from "@leoninestudios/daice-chain-core";

/** Path (dot/bracket, e.g. "generatedBy.email") -> human-readable message. */
export type FieldErrors = Record<string, string>;

function zodPathToString(path: (string | number)[]): string {
  let result = "";
  for (const segment of path) {
    if (typeof segment === "number") result += `[${segment}]`;
    else result += result ? `.${segment}` : segment;
  }
  return result || "(root)";
}

function issuesToFieldErrors(issues: z.ZodIssue[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const path = zodPathToString(issue.path);
    // Keep the first message per path — superRefine can add more than one
    // issue at the same path but the UI only has room for one line.
    if (!(path in errors)) errors[path] = issue.message;
  }
  return errors;
}

/**
 * Validates a draft contact (`{ name, email? }`) against `@leoninestudios/daice-chain-core`'s
 * `contactSchema` — the same schema that governs `package.createdBy` and
 * asset `generatedBy` — so the editor never accepts a value `validatePackage`
 * would later reject on import. See docs/planning/04-editor.md Part D.
 */
export function validateContactDraft(contact: unknown): FieldErrors {
  const result = contactSchema.safeParse(contact);
  return result.success ? {} : issuesToFieldErrors(result.error.issues);
}

/** Validates a draft asset object against `@leoninestudios/daice-chain-core`'s `assetSchema` (includes the AI-conditional-required rules and timecode pairing). */
export function validateAssetDraft(asset: unknown): FieldErrors {
  const result = assetSchema.safeParse(asset);
  return result.success ? {} : issuesToFieldErrors(result.error.issues);
}

/** Validates draft package metadata against `@leoninestudios/daice-chain-core`'s `packageMetadataSchema`. */
export function validatePackageMetaDraft(meta: unknown): FieldErrors {
  const result = packageMetadataSchema.safeParse(meta);
  return result.success ? {} : issuesToFieldErrors(result.error.issues);
}
