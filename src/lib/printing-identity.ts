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

export type PrintingIdentityAttributes = Pick<
  PrintingIdentityInput,
  "cardBackDesign" | "printingFinish" | "physicalForm"
>;

export function normalizePrintingIdentityAttribute(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const normalized = normalizeIdentityPart(value);
  return normalized.length > 0 ? normalized : null;
}

export function printingIdentityAttributesCompatible(
  existing: PrintingIdentityAttributes,
  incoming: PrintingIdentityAttributes,
): boolean {
  return (["cardBackDesign", "printingFinish", "physicalForm"] as const).every(
    (attribute) => {
      const existingValue = normalizePrintingIdentityAttribute(
        existing[attribute],
      );
      const incomingValue = normalizePrintingIdentityAttribute(
        incoming[attribute],
      );

      return (
        existingValue === null ||
        incomingValue === null ||
        existingValue === incomingValue
      );
    },
  );
}

export function mergePrintingIdentityAttributes(
  existing: PrintingIdentityAttributes,
  incoming: PrintingIdentityAttributes,
): Required<PrintingIdentityAttributes> {
  return {
    cardBackDesign: existing.cardBackDesign ?? incoming.cardBackDesign ?? null,
    printingFinish: existing.printingFinish ?? incoming.printingFinish ?? null,
    physicalForm: existing.physicalForm ?? incoming.physicalForm ?? null,
  };
}

function identitySuffix(input: PrintingIdentityInput): string {
  const values = [
    ["finish", input.printingFinish],
    ["form", input.physicalForm],
    ["back", input.cardBackDesign],
    ["group", input.componentGroupKey],
    ["component", input.componentKey],
  ] as const;

  return values.reduce((suffix, [label, value]) => {
    const normalizedValue = normalizePrintingIdentityAttribute(value);
    return normalizedValue
      ? `${suffix}:${label}:${encodeURIComponent(normalizedValue)}`
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
