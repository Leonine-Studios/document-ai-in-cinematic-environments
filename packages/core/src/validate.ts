import { z } from "zod";
import { DAICE_VERSIONS, daicePackageSchema } from "./schema.js";
import type { DaicePackage, ValidationError, ValidationResult } from "./types.js";

function zodPathToString(path: (string | number)[]): string {
  let result = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      result += `[${segment}]`;
    } else {
      result += result ? `.${segment}` : segment;
    }
  }
  return result || "(root)";
}

function zodIssuesToErrors(issues: z.ZodIssue[]): ValidationError[] {
  return issues.map((issue) => {
    const path = zodPathToString(issue.path);
    if (path === "daiceVersion" && (issue.code === z.ZodIssueCode.invalid_enum_value || issue.code === z.ZodIssueCode.invalid_literal)) {
      return {
        path,
        message: `unrecognized daiceVersion: ${JSON.stringify((issue as { received?: unknown }).received)}. This implementation only supports ${DAICE_VERSIONS.map((v) => `"${v}"`).join(" and ")}.`,
      };
    }
    return { path, message: issue.message };
  });
}

/**
 * Checks referential integrity that plain schema validation cannot express:
 * unique asset ids, resolvable asset references, and no reference cycles.
 * Assumes `pkg` has already passed shape validation.
 */
function checkReferentialIntegrity(pkg: DaicePackage): ValidationError[] {
  const errors: ValidationError[] = [];
  const idCounts = new Map<string, number>();
  for (const asset of pkg.assets) {
    idCounts.set(asset.id, (idCounts.get(asset.id) ?? 0) + 1);
  }
  const idToIndex = new Map<string, number>();
  pkg.assets.forEach((asset, index) => {
    if (!idToIndex.has(asset.id)) idToIndex.set(asset.id, index);
  });

  pkg.assets.forEach((asset, assetIndex) => {
    if ((idCounts.get(asset.id) ?? 0) > 1) {
      errors.push({ path: `assets[${assetIndex}].id`, message: `duplicate asset id "${asset.id}" — asset ids must be unique within a package` });
    }
    asset.references.forEach((ref, refIndex) => {
      if (!idToIndex.has(ref.assetId)) {
        errors.push({
          path: `assets[${assetIndex}].references[${refIndex}].assetId`,
          message: `references[${refIndex}].assetId "${ref.assetId}" does not match any asset id in this package`,
        });
      }
    });
  });

  // Cycle detection via DFS over the asset-reference graph, using only
  // resolvable references (dangling refs are already reported above).
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(pkg.assets.map((a) => [a.id, WHITE]));
  const cyclesReported = new Set<string>();

  function visit(assetId: string, path: string[]): void {
    color.set(assetId, GRAY);
    const index = idToIndex.get(assetId);
    const asset = index !== undefined ? pkg.assets[index] : undefined;
    if (asset) {
      for (const ref of asset.references) {
        if (!idToIndex.has(ref.assetId)) continue; // dangling, already reported
        const nextColor = color.get(ref.assetId);
        if (nextColor === GRAY) {
          const cycleKey = [...path, assetId, ref.assetId].sort().join(">");
          if (!cyclesReported.has(cycleKey)) {
            cyclesReported.add(cycleKey);
            const assetIdx = idToIndex.get(assetId)!;
            errors.push({
              path: `assets[${assetIdx}]`,
              message: `reference cycle detected: ${[...path, assetId, ref.assetId].join(" -> ")}`,
            });
          }
        } else if (nextColor === WHITE) {
          visit(ref.assetId, [...path, assetId]);
        }
      }
    }
    color.set(assetId, BLACK);
  }

  for (const asset of pkg.assets) {
    if (color.get(asset.id) === WHITE) visit(asset.id, []);
  }

  pkg.declarations?.forEach((declaration, declIndex) => {
    const seen = new Set<string>();
    declaration.statements.forEach((statement, stIndex) => {
      if (seen.has(statement.id)) {
        errors.push({
          path: `declarations[${declIndex}].statements[${stIndex}].id`,
          message: `duplicate statement id "${statement.id}" — statement ids must be unique within a declaration`,
        });
      }
      seen.add(statement.id);
    });
  });

  return errors;
}

/**
 * Validates an unknown value as a DAICE-Chain package: shape (via the Zod schema)
 * first, then referential integrity. Never throws; always returns a
 * structured, path-scoped result. See spec/README.md §4 and
 * spec/conformance.md §1 for the contract this implements.
 */
export function validatePackage(input: unknown): ValidationResult {
  const parsed = daicePackageSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, errors: zodIssuesToErrors(parsed.error.issues) };
  }

  const pkg = parsed.data as DaicePackage;
  const referentialErrors = checkReferentialIntegrity(pkg);
  if (referentialErrors.length > 0) {
    return { valid: false, errors: referentialErrors };
  }

  return { valid: true, errors: [], package: pkg };
}
