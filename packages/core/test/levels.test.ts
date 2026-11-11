import { describe, expect, it } from "vitest";
import { deriveToolsFromAssets, documentationLevelOf, upgradeToCurrentVersion } from "../src/levels.js";
import { validatePackage } from "../src/validate.js";
import { demoPackage, validFixture } from "./fixtures.js";
import type { DaicePackage } from "../src/types.js";

describe("documentationLevelOf", () => {
  it("defaults to detailed", () => {
    expect(documentationLevelOf(demoPackage() as DaicePackage)).toBe("detailed");
  });
  it("reads simplified", () => {
    expect(documentationLevelOf(validFixture("simplified-package.json") as DaicePackage)).toBe("simplified");
  });
});

describe("deriveToolsFromAssets", () => {
  it("returns one entry per provider/model pair, skipping non-AI assets", () => {
    const pkg = demoPackage() as DaicePackage;
    const tools = deriveToolsFromAssets(pkg);
    const keys = tools.map((t) => `${t.provider}/${t.model}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(tools.length).toBeGreaterThan(0);
    const aiPairs = new Set(pkg.assets.filter((a) => a.aiGenerated).map((a) => `${a.provider}/${a.model}`));
    expect(new Set(keys)).toEqual(aiPairs);
  });

  it("combines distinct users per pair", () => {
    const base = { references: [], aiGenerated: true, provider: "P", model: "M", generatedAt: "2026-01-01T00:00:00Z" };
    const tools = deriveToolsFromAssets({
      assets: [
        { ...base, id: "a", generatedBy: { name: "A", email: "a@x.com" } },
        { ...base, id: "b", generatedBy: { name: "A again", email: "A@x.com" } },
        { ...base, id: "c", generatedBy: { name: "B" } },
        { id: "d", aiGenerated: false, references: [] },
      ],
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]?.usedBy).toHaveLength(2);
  });
});

describe("upgradeToCurrentVersion", () => {
  it("relabels a 0.1.0 package as 0.2.0 and keeps it valid", () => {
    const upgraded = upgradeToCurrentVersion(demoPackage() as DaicePackage);
    expect(upgraded.daiceVersion).toBe("0.2.0");
    expect(validatePackage(upgraded).valid).toBe(true);
  });
});
