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
  printingFinish?: string | null;
  physicalForm?: string | null;
  cardBackDesign?: string | null;
  catalogProvider?: string | null;
  catalogSetId?: string | null;
  catalogCardId?: string | null;
  componentGroupKey?: string | null;
  componentKey?: string | null;
};

function identitySuffix(input: PrintingIdentityInput): string {
  const values = [
    ["finish", input.printingFinish],
    ["form", input.physicalForm],
    ["back", input.cardBackDesign],
    ["group", input.componentGroupKey],
    ["component", input.componentKey],
  ] as const;

  return values.reduce((suffix, [label, value]) => {
    return value
      ? `${suffix}:${label}:${encodeURIComponent(normalizeIdentityPart(value))}`
      : suffix;
  }, "");
}

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
  const catalogSetId = input.catalogSetId
    ? normalizeIdentityPart(input.catalogSetId)
    : null;
  const suffix = identitySuffix(input);

  if (catalogProvider && catalogSetId && catalogCardId) {
    return `catalog:${catalogProvider}:${normalizeIdentityPart(input.languageCode)}:${catalogSetId}:${catalogCardId}:${variant}${suffix}`;
  }

  const scope = [
    normalizeIdentityPart(input.gameSlug),
    normalizeIdentityPart(input.languageCode),
    normalizeIdentityPart(input.setCode),
  ].join(":");
  const collectorKey = collectorIdentifierKey(input.collectorNumber);

  return collectorKey
    ? `published:${scope}:${collectorKey}:${variant}${suffix}`
    : `manual:${scope}:${normalizeIdentityPart(input.name)}:${variant}${suffix}`;
}
