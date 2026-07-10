import type { DaicePackage } from "@daice-chain/core";

/**
 * localStorage-backed lists of previously used AI `provider` and `model`
 * values, mirroring contactRegistry.ts's pattern so the "Provider"/"Model"
 * fields can offer dropdown suggestions instead of requiring a fresh retype
 * on every asset. Purely an editor convenience — the spec has no registrar
 * concept for these either. Scoped to this browser only. See
 * docs/planning/04-editor.md Part E and the "Editor v3" amendment.
 */
const PROVIDER_STORAGE_KEY = "daice-editor:provider-registry";
const MODEL_STORAGE_KEY = "daice-editor:model-registry";
const MAX_ENTRIES = 200;

function loadList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    return [];
  }
}

function saveList(key: string, values: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // localStorage unavailable (private browsing, quota) — degrade silently, this is a convenience feature only.
  }
}

function remember(key: string, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const existing = loadList(key);
  const withoutDuplicate = existing.filter((v) => v.toLowerCase() !== trimmed.toLowerCase());
  saveList(key, [trimmed, ...withoutDuplicate].slice(0, MAX_ENTRIES));
}

/** Merges registry + in-package suggestions into one case-insensitively deduped list, registry entries first (most-recently-used). */
export function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function loadProviderRegistry(): string[] {
  return loadList(PROVIDER_STORAGE_KEY);
}

export function loadModelRegistry(): string[] {
  return loadList(MODEL_STORAGE_KEY);
}

/** Adds/updates a provider in the registry, deduped case-insensitively. Call whenever a provider field is saved. */
export function rememberProvider(provider: string): void {
  remember(PROVIDER_STORAGE_KEY, provider);
}

/** Adds/updates a model in the registry, deduped case-insensitively. Call whenever a model field is saved. */
export function rememberModel(model: string): void {
  remember(MODEL_STORAGE_KEY, model);
}

/** Every distinct provider/model mentioned by an asset in a package. */
export function collectPackageProvidersAndModels(pkg: DaicePackage): { providers: string[]; models: string[] } {
  const providers: string[] = [];
  const models: string[] = [];
  for (const asset of pkg.assets) {
    if (asset.provider) providers.push(asset.provider);
    if (asset.model) models.push(asset.model);
  }
  return { providers, models };
}

/** Merges every provider/model referenced by a package into the registries — called on package load/import so previously-authored packages seed future suggestions. */
export function rememberProviderModelsFromPackage(pkg: DaicePackage): void {
  const { providers, models } = collectPackageProvidersAndModels(pkg);
  for (const provider of providers) rememberProvider(provider);
  for (const model of models) rememberModel(model);
}
