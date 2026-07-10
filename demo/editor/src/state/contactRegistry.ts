import type { DaicePackage, Contact } from "@leoninestudios/daice-chain-core";

/**
 * A localStorage-backed list of previously used `{ name, email? }` pairs, so
 * a user doesn't have to retype the same creator/generator over and over.
 * This is purely an editor convenience: the spec itself has no contact
 * "registrar" concept (see spec/README.md §2.4) — contacts remain a plain
 * coupled name+email pair on the package/asset itself. Scoped to this
 * browser only, per the repo's "no database" rule (see
 * docs/planning/04-editor.md Part E).
 */
const STORAGE_KEY = "daice-editor:contact-registry";

function contactKey(contact: Contact): string {
  return `${contact.name.trim().toLowerCase()}\u0000${(contact.email ?? "").trim().toLowerCase()}`;
}

export function loadContactRegistry(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is Contact => typeof c?.name === "string");
  } catch {
    return [];
  }
}

function saveContactRegistry(contacts: Contact[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  } catch {
    // localStorage unavailable (private browsing, quota) — degrade silently, this is a convenience feature only.
  }
}

/** Adds/updates a contact in the registry, deduped by name+email (case-insensitive). Call whenever a contact field is saved. */
export function rememberContact(contact: Contact): void {
  if (!contact.name.trim()) return;
  const existing = loadContactRegistry();
  const key = contactKey(contact);
  const withoutDuplicate = existing.filter((c) => contactKey(c) !== key);
  saveContactRegistry([{ name: contact.name.trim(), email: contact.email?.trim() || undefined }, ...withoutDuplicate].slice(0, 200));
}

/** Every distinct contact mentioned in a package: `createdBy` plus each asset's `generatedBy`. */
export function collectPackageContacts(pkg: DaicePackage): Contact[] {
  const contacts: Contact[] = [pkg.package.createdBy];
  for (const asset of pkg.assets) if (asset.generatedBy) contacts.push(asset.generatedBy);
  return contacts;
}

/** Merges every contact referenced by a package (`createdBy` + each asset's `generatedBy`) into the registry — called on package load/import so previously-authored packages seed future suggestions. */
export function rememberContactsFromPackage(pkg: DaicePackage): void {
  for (const contact of collectPackageContacts(pkg)) rememberContact(contact);
}
