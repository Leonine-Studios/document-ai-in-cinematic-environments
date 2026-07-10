import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const demoExamplesDir = path.resolve(here, "../../../demo/examples");

export function loadFixture(...segments: string[]): unknown {
  const file = path.join(demoExamplesDir, ...segments);
  return JSON.parse(readFileSync(file, "utf8"));
}

export const demoPackage = () => loadFixture("demo-package", "daice.json");
export const invalidFixture = (name: string) => loadFixture("invalid", name);
export const validFixture = (name: string) => loadFixture("valid", name);
