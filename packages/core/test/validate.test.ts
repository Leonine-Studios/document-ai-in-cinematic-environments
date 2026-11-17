import { describe, expect, it } from "vitest";
import { validatePackage } from "../src/validate.js";
import { demoPackage, invalidFixture, validFixture } from "./fixtures.js";

describe("validatePackage", () => {
  it("accepts the demo package with no errors", () => {
    const result = validatePackage(demoPackage());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    if (result.valid) {
      expect(result.package.assets).toHaveLength(9);
    }
  });

  it("rejects a dangling asset reference with a path-scoped error", () => {
    const result = validatePackage(invalidFixture("dangling-reference.json"));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "assets[0].references[0].assetId")).toBe(true);
  });

  it("rejects duplicate asset ids", () => {
    const result = validatePackage(invalidFixture("duplicate-id.json"));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("duplicate asset id"))).toBe(true);
  });

  it("rejects a reference cycle", () => {
    const result = validatePackage(invalidFixture("reference-cycle.json"));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("reference cycle"))).toBe(true);
  });

  it("rejects a missing required field with a path-scoped error", () => {
    const result = validatePackage(invalidFixture("missing-field.json"));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "assets[0].provider")).toBe(true);
  });

  it("accepts an AI-generated asset with no prompt (SHOULD, not MUST)", () => {
    const result = validatePackage(validFixture("prompt-omitted-and-unavailable-media.json"));
    expect(result.valid).toBe(true);
    if (result.valid) {
      const upscale = result.package.assets.find((a) => a.id === "asset-plate-upscale")!;
      expect(upscale.aiGenerated).toBe(true);
      expect(upscale.prompt).toBeUndefined();
    }
  });

  it("accepts a referenced asset with no mediaPath, documented only via metadata", () => {
    const result = validatePackage(validFixture("prompt-omitted-and-unavailable-media.json"));
    expect(result.valid).toBe(true);
    if (result.valid) {
      const stockRef = result.package.assets.find((a) => a.id === "asset-stock-ref")!;
      expect(stockRef.mediaPath).toBeUndefined();
      expect(stockRef.metadata).toBeDefined();
    }
  });

  it("rejects an unrecognized daiceVersion", () => {
    const result = validatePackage(invalidFixture("unknown-version.json"));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "daiceVersion")).toBe(true);
  });

  it("never throws on arbitrary garbage input", () => {
    expect(() => validatePackage(null)).not.toThrow();
    expect(() => validatePackage(42)).not.toThrow();
    expect(() => validatePackage("not a package")).not.toThrow();
    expect(() => validatePackage({})).not.toThrow();
    expect(validatePackage(null).valid).toBe(false);
  });

  it("rejects unknown top-level keys", () => {
    const pkg = demoPackage() as Record<string, unknown>;
    const result = validatePackage({ ...pkg, unexpectedField: true });
    expect(result.valid).toBe(false);
  });

  describe("v0.2.0: documentation levels, tools, declarations", () => {
    it("accepts a simple package and a detailed one with tools and a declaration", () => {
      expect(validatePackage(validFixture("simple-package.json")).valid).toBe(true);
      expect(validatePackage(validFixture("detailed-with-tools-and-declaration.json")).valid).toBe(true);
    });

    it("still accepts a v0.1.0 package", () => {
      expect(validatePackage(validFixture("legacy-v0.1.0.json")).valid).toBe(true);
    });

    it("rejects a simple package with no tools, or an empty tools list", () => {
      for (const name of ["simple-missing-tools.json", "simple-empty-tools.json"]) {
        const result = validatePackage(invalidFixture(name));
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.path === "tools")).toBe(true);
      }
    });

    it("rejects new fields in a package labelled 0.1.0", () => {
      const result = validatePackage(invalidFixture("v0.1.0-with-tools.json"));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "tools")).toBe(true);
    });

    it("rejects a tool without a model, with a path", () => {
      const result = validatePackage(invalidFixture("tool-missing-model.json"));
      expect(result.errors.some((e) => e.path === "tools[0].model")).toBe(true);
    });

    it("rejects a declaration without declaredBy and an unknown documentation level", () => {
      expect(
        validatePackage(invalidFixture("declaration-missing-declared-by.json")).errors.some(
          (e) => e.path === "declarations[0].declaredBy",
        ),
      ).toBe(true);
      expect(
        validatePackage(invalidFixture("unknown-documentation-level.json")).errors.some(
          (e) => e.path === "package.documentationLevel",
        ),
      ).toBe(true);
    });

    it("rejects duplicate statement ids within a declaration", () => {
      const result = validatePackage(invalidFixture("declaration-duplicate-statement-id.json"));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "declarations[0].statements[1].id")).toBe(true);
    });

    it("names both supported versions for an unknown daiceVersion", () => {
      const result = validatePackage(invalidFixture("unknown-version.json"));
      expect(result.errors[0]?.message).toContain('"0.1.0" and "0.2.0"');
    });
  });
});
