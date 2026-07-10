import { describe, expect, it } from "vitest";
import { validatePackage } from "../src/validate.js";
import { flattenForTable } from "../src/flatten.js";
import { demoPackage } from "./fixtures.js";

describe("flattenForTable", () => {
  it("produces one row per asset in the same order", () => {
    const result = validatePackage(demoPackage());
    if (!result.valid) throw new Error("demo package must be valid for this test");

    const rows = flattenForTable(result.package);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.id)).toEqual(result.package.assets.map((a) => a.id));
  });

  it("reflects aiGenerated, reference count, and provider correctly", () => {
    const result = validatePackage(demoPackage());
    if (!result.valid) throw new Error("demo package must be valid for this test");

    const rows = flattenForTable(result.package);
    const finalRow = rows.find((r) => r.id === "asset-hero-final")!;
    expect(finalRow.aiGenerated).toBe(true);
    expect(finalRow.referenceCount).toBe(2);
    expect(finalRow.provider).toBe("Magnific");
    expect(finalRow.usedInShow).toBe(true);

    const plateRow = rows.find((r) => r.id === "asset-raw-plate")!;
    expect(plateRow.aiGenerated).toBe(false);
    expect(plateRow.provider).toBe("");
    expect(plateRow.referenceCount).toBe(0);
    expect(plateRow.usedInShow).toBe(false);
  });

  it("truncates long prompts to an excerpt", () => {
    const pkg = demoPackage() as any;
    pkg.assets[0].prompt = "x".repeat(200);
    const result = validatePackage(pkg);
    if (!result.valid) throw new Error("expected valid package");
    const rows = flattenForTable(result.package);
    expect(rows[0].promptExcerpt.length).toBeLessThan(200);
    expect(rows[0].promptExcerpt.endsWith("…")).toBe(true);
  });
});
