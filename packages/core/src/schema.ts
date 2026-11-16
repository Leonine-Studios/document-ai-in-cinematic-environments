import { z } from "zod";

/**
 * Zod schemas mirroring ../../../spec/schema/daice.schema.json.
 * Any change here MUST be reflected in the JSON Schema and in
 * ../../../spec/README.md in the same commit — see spec/README.md §0.
 */

const TIMECODE_PATTERN = /^\d{2}:\d{2}:\d{2}:\d{2}$/;

export const contactSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email().optional(),
  })
  .strict();

export const DAICE_VERSIONS = ["0.1.0", "0.2.0"] as const;
export const CURRENT_DAICE_VERSION = "0.2.0" as const;

export const documentationLevelSchema = z.enum(["detailed", "simple"]);

export const packageMetadataSchema = z
  .object({
    id: z.string().min(1),
    packageName: z.string().min(1),
    description: z.string().optional(),
    documentationLevel: documentationLevelSchema.optional(),
    createdAt: z.string().datetime({ offset: true }),
    createdBy: contactSchema,
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const referenceSchema = z
  .object({
    assetId: z.string().min(1),
    label: z.string().optional(),
  })
  .strict();

const assetBaseSchema = z
  .object({
    id: z.string().min(1),
    aiGenerated: z.boolean(),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    prompt: z.string().optional(),
    generatedBy: contactSchema.optional(),
    generatedAt: z.string().datetime({ offset: true }).optional(),
    seed: z.number().int().optional(),
    mediaPath: z.string().regex(/^assets\//, "mediaPath must start with \"assets/\"").optional(),
    mediaMimeType: z.string().min(1).optional(),
    references: z.array(referenceSchema),
    timecodeIn: z.string().regex(TIMECODE_PATTERN, "timecodeIn must match HH:MM:SS:FF").optional(),
    timecodeOut: z.string().regex(TIMECODE_PATTERN, "timecodeOut must match HH:MM:SS:FF").optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const assetSchema = assetBaseSchema.superRefine((asset, ctx) => {
  if (asset.aiGenerated) {
    if (!asset.provider) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["provider"], message: "provider is required when aiGenerated is true" });
    }
    if (!asset.model) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["model"], message: "model is required when aiGenerated is true" });
    }
    if (!asset.generatedBy) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["generatedBy"], message: "generatedBy is required when aiGenerated is true" });
    }
    if (!asset.generatedAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["generatedAt"], message: "generatedAt is required when aiGenerated is true" });
    }
  }
  const hasIn = asset.timecodeIn !== undefined;
  const hasOut = asset.timecodeOut !== undefined;
  if (hasIn !== hasOut) {
    const missing = hasIn ? "timecodeOut" : "timecodeIn";
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [missing], message: `${missing} is required when the other timecode is present` });
  }
});

export const toolSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    usedBy: z.array(contactSchema).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const statementSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
  })
  .strict();

export const declarationSchema = z
  .object({
    declaredBy: contactSchema,
    declaredAt: z.string().datetime({ offset: true }),
    statements: z.array(statementSchema).min(1),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const daicePackageSchema = z
  .object({
    daiceVersion: z.enum(DAICE_VERSIONS),
    package: packageMetadataSchema,
    tools: z.array(toolSchema).optional(),
    declarations: z.array(declarationSchema).optional(),
    assets: z.array(assetSchema),
  })
  .strict()
  .superRefine((pkg, ctx) => {
    if (pkg.package.documentationLevel === "simple" && (!pkg.tools || pkg.tools.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tools"],
        message: "tools is required (at least one entry) when documentationLevel is simple",
      });
    }
    if (pkg.daiceVersion === "0.1.0") {
      if (pkg.tools !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tools"], message: 'tools requires daiceVersion "0.2.0"' });
      }
      if (pkg.declarations !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["declarations"], message: 'declarations requires daiceVersion "0.2.0"' });
      }
      if (pkg.package.documentationLevel !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["package", "documentationLevel"],
          message: 'documentationLevel requires daiceVersion "0.2.0"',
        });
      }
    }
  });
