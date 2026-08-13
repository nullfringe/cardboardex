const MISSING_COLLECTOR_SORT = 2_147_483_647;

export function normalizeIdentityPart(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ");
}

export function collectorIdentifierKey(value: string | null): string | null {
  if (value === null) return null;

  return normalizeIdentityPart(value)
    .replace(/\s+/gu, "")
    .split("/")
    .map((part) => (/^\d+$/u.test(part) ? String(Number(part)) : part))
    .join("/");
}

export function collectorIdentifierSort(value: string | null): number {
  if (value === null) return MISSING_COLLECTOR_SORT;
  const number = value.normalize("NFKC").trim().match(/^\d+/u)?.[0];
  return number ? Number(number) : MISSING_COLLECTOR_SORT;
}

export type PrintingIdentityInput = {
  gameSlug: string;
  setCode: string;
  languageCode: string;
  name: string;
  collectorNumber: string | null;
  printingVariantKey: string;
  catalogProvider?: string | null;
  catalogCardId?: string | null;
};

export function stablePrintingIdentityKey(
  input: PrintingIdentityInput,
): string {
  const variant = normalizeIdentityPart(input.printingVariantKey);
  const catalogProvider = input.catalogProvider
    ? normalizeIdentityPart(input.catalogProvider)
    : null;
  const catalogCardId = input.catalogCardId
    ? normalizeIdentityPart(input.catalogCardId)
    : null;

  if (catalogProvider && catalogCardId) {
    return `catalog:${catalogProvider}:${normalizeIdentityPart(input.languageCode)}:${catalogCardId}:${variant}`;
  }

  const scope = [
    normalizeIdentityPart(input.gameSlug),
    normalizeIdentityPart(input.languageCode),
    normalizeIdentityPart(input.setCode),
  ].join(":");
  const collectorKey = collectorIdentifierKey(input.collectorNumber);

  return collectorKey
    ? `published:${scope}:${collectorKey}:${variant}`
    : `manual:${scope}:${normalizeIdentityPart(input.name)}:${variant}`;
}
