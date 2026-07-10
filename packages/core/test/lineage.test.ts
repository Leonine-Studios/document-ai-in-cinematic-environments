import { describe, expect, it } from "vitest";
import { validatePackage } from "../src/validate.js";
import { resolveLineage } from "../src/lineage.js";
import { demoPackage, invalidFixture } from "./fixtures.js";
import type { DaicePackage } from "../src/types.js";

describe("resolveLineage", () => {
  it("unfolds the demo package's final asset to its full nested DAG", () => {
    const result = validatePackage(demoPackage());
    if (!result.valid) throw new Error("demo package must be valid for this test");

    const tree = resolveLineage("asset-hero-final", result.package);
    expect(tree.asset.id).toBe("asset-hero-final");
    expect(tree.children.map((c) => c.asset.id).sort()).toEqual(["asset-hero-composite", "asset-style-ref"]);

    const styleRef = tree.children.find((c) => c.asset.id === "asset-style-ref")!;
    expect(styleRef.asset.aiGenerated).toBe(false);
    expect(styleRef.children).toHaveLength(0);

    const composite = tree.children.find((c) => c.asset.id === "asset-hero-composite")!;
    expect(composite.children.map((c) => c.asset.id).sort()).toEqual([
      "asset-bg-generated",
      "asset-hero-upscaled",
      "asset-style-ref",
    ]);

    // asset-style-ref is shared: it recurs as a leaf here too, illustrating the DAG.
    const compositeStyleRef = composite.children.find((c) => c.asset.id === "asset-style-ref")!;
    expect(compositeStyleRef.children).toHaveLength(0);

    const upscaled = composite.children.find((c) => c.asset.id === "asset-hero-upscaled")!;
    expect(upscaled.children).toHaveLength(1);
    expect(upscaled.children[0].asset.id).toBe("asset-raw-plate");
    expect(upscaled.children[0].asset.aiGenerated).toBe(false);
    expect(upscaled.children[0].children).toHaveLength(0);

    const bgGenerated = composite.children.find((c) => c.asset.id === "asset-bg-generated")!;
    expect(bgGenerated.children).toHaveLength(0);
  });

  it("terminates even when given an (invalid, unvalidated) package containing a cycle", () => {
    const cyclic = invalidFixture("reference-cycle.json") as DaicePackage;
    // Deliberately bypass validatePackage — this exercises resolveLineage's own defensive cycle guard.
    const tree = resolveLineage("asset-a", cyclic);
    expect(tree.asset.id).toBe("asset-a");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].asset.id).toBe("asset-b");
    // asset-b references asset-a again; that repeat is surfaced as a single
    // leaf node (showing the cycle exists) instead of recursing forever.
    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].asset.id).toBe("asset-a");
    expect(tree.children[0].children[0].children).toHaveLength(0);
  });

  it("throws a clear error when asked to resolve an unknown asset id", () => {
    const result = validatePackage(demoPackage());
    if (!result.valid) throw new Error("demo package must be valid for this test");
    expect(() => resolveLineage("does-not-exist", result.package)).toThrow(/does-not-exist/);
  });
});
