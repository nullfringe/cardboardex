import { normalizeIdentityPart } from "@/lib/printing-identity";

type PublishedValue = string | number | readonly string[];

function normalizedPublishedValue(value: PublishedValue): string | number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return normalizeIdentityPart(value);
  return value.map(normalizeIdentityPart).join("\u001f");
}

export function publishedValuesCompatible(
  existing: PublishedValue | null | undefined,
  incoming: PublishedValue | null | undefined,
): boolean {
  return (
    existing == null ||
    incoming == null ||
    normalizedPublishedValue(existing) === normalizedPublishedValue(incoming)
  );
}

export function reconcilePublishedValue<T extends PublishedValue>(
  existing: T | null | undefined,
  incoming: T | null | undefined,
  conflict: () => Error,
): T | null {
  if (existing == null) return incoming ?? null;
  if (incoming == null) return existing;
  if (!publishedValuesCompatible(existing, incoming)) throw conflict();
  return existing;
}
