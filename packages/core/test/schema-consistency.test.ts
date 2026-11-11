import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { validatePackage } from "../src/validate.js";
import { demoPackage, loadFixture } from "./fixtures.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const jsonSchemaPath = path.resolve(here, "../../../spec/schema/daice.schema.json");
const jsonSchema = JSON.parse(readFileSync(jsonSchemaPath, "utf8"));

// strictRequired is disabled because our schema's conditional `then` block
// legitimately requires properties defined in the parent `properties` object
// rather than redeclaring them locally — this is valid JSON Schema, just a
// style ajv's strict mode warns about.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const jsonSchemaValidate = ajv.compile(jsonSchema);

const invalidDir = path.resolve(here, "../../../demo/examples/invalid");
const validDir = path.resolve(here, "../../../demo/examples/valid");
const validFixtureNames = readdirSync(validDir).filter((f) => f.endsWith(".json"));
const invalidFixtureNames = readdirSync(invalidDir).filter((f) => f.endsWith(".json"));

describe("JSON Schema and Zod schema agree", () => {
  it("both accept the demo package", () => {
    const pkg = demoPackage();
    expect(jsonSchemaValidate(pkg)).toBe(true);
    expect(validatePackage(pkg).valid).toBe(true);
  });

  it("both accept a package with an omitted prompt and a metadata-only referenced asset", () => {
    const pkg = loadFixture("valid", "prompt-omitted-and-unavailable-media.json");
    expect(jsonSchemaValidate(pkg)).toBe(true);
    expect(validatePackage(pkg).valid).toBe(true);
  });

  it.each(validFixtureNames)("both accept valid fixture %s", (name) => {
    const fixture = loadFixture("valid", name);
    expect(jsonSchemaValidate(fixture)).toBe(true);
    expect(validatePackage(fixture).valid).toBe(true);
  });

  it.each(invalidFixtureNames)("both reject invalid fixture %s (schema-level failures only)", (name) => {
    const fixture = loadFixture("invalid", name);
    const zodResult = validatePackage(fixture);
    const jsonSchemaResult = jsonSchemaValidate(fixture);

    // Referential-integrity-only failures (dangling ref, duplicate id, cycle) are valid
    // per the JSON Schema alone by design — that layer is checked separately by
    // validatePackage, per spec/README.md §4. Every other fixture must fail both.
    const referentialOnly = [
      "dangling-reference.json",
      "duplicate-id.json",
      "reference-cycle.json",
      "declaration-duplicate-statement-id.json",
    ];
    if (referentialOnly.includes(name)) {
      expect(jsonSchemaResult).toBe(true);
      expect(zodResult.valid).toBe(false);
    } else {
      expect(jsonSchemaResult).toBe(false);
      expect(zodResult.valid).toBe(false);
    }
  });
});
