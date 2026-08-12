import { parse } from "csv-parse/sync";

import type { RawImportRow } from "@/db/schema";

export const COLLECTION_CSV_HEADERS = [
  "Inventory ID",
  "Card Kind",
  "Name",
  "TCG Type",
  "Stage / Trainer Subtype",
  "HP",
  "Quantity",
  "Special / Rule Box",
  "Visible Move / Effect 1",
  "Visible Move / Effect 2",
  "ID Confidence",
  "Notes",
  "Water/Psychic Deck Pool",
  "Collector No.",
  "Expansion",
  "Set ID",
  "Collector Source",
  "Evolves From",
  "Ability / Rule",
  "Attack 1 Name",
  "Attack 1 Cost",
  "Attack 1 Damage",
  "Attack 1 Effect",
  "Attack 2 Name",
  "Attack 2 Cost",
  "Attack 2 Damage",
  "Attack 2 Effect",
  "Weakness",
  "Resistance",
  "Retreat Cost",
  "Regulation Mark",
  "Trainer / Other Text",
  "Finish / Variant",
] as const;

export type CollectionCsvHeader = (typeof COLLECTION_CSV_HEADERS)[number];

export type ParsedAttack = {
  position: number;
  name: string;
  cost: string[];
  damage: string | null;
  effect: string | null;
};

export type ParsedCollectionRow = {
  csvRowNumber: number;
  inventoryId: string;
  cardKind: string;
  name: string;
  pokemonType: string | null;
  subtype: string;
  hp: number | null;
  quantity: number;
  specialRuleBox: string | null;
  visibleMoveOrEffect1: string;
  visibleMoveOrEffect2: string | null;
  identificationConfidence: string;
  notes: string | null;
  deckPool: string | null;
  collectorNumber: string;
  collectorNumberKey: string;
  collectorNumberSort: number;
  expansion: string;
  setCode: string;
  externalReferenceUrl: string;
  evolvesFrom: string | null;
  abilityRule: string | null;
  attacks: ParsedAttack[];
  weakness: string | null;
  resistance: string | null;
  retreatCost: number | null;
  regulationMark: string | null;
  rulesText: string | null;
  rarity: string | null;
  finishVariant: string | null;
  sealed: boolean;
  printingVariantKey: string;
  languageCode: string;
  rawRow: RawImportRow;
};

type ErrorContext = {
  rowNumber?: number;
  inventoryId?: string;
  field?: CollectionCsvHeader;
};

export class CollectionCsvError extends Error {
  readonly rowNumber?: number;
  readonly inventoryId?: string;
  readonly field?: CollectionCsvHeader;

  constructor(message: string, context: ErrorContext = {}, cause?: unknown) {
    const location = formatErrorLocation(context);
    super(location ? `${location}: ${message}` : message, { cause });
    this.name = "CollectionCsvError";
    this.rowNumber = context.rowNumber;
    this.inventoryId = context.inventoryId;
    this.field = context.field;
  }
}

const knownRarities = new Map<string, string>([
  ["common", "Common"],
  ["uncommon", "Uncommon"],
  ["rare", "Rare"],
  ["double rare", "Double Rare"],
  ["ultra rare", "Ultra Rare"],
  ["illustration rare", "Illustration Rare"],
  ["special illustration rare", "Special Illustration Rare"],
  ["hyper rare", "Hyper Rare"],
]);

function formatErrorLocation(context: ErrorContext): string {
  const parts: string[] = [];

  if (context.rowNumber !== undefined) {
    parts.push(`CSV row ${context.rowNumber}`);
  }

  if (context.inventoryId) {
    parts.push(`Inventory ID ${context.inventoryId}`);
  }

  if (context.field) {
    parts.push(`field "${context.field}"`);
  }

  return parts.join(", ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedCell(value: string): string | null {
  const normalized = value.trim().normalize("NFC");
  return normalized.length > 0 ? normalized : null;
}

function requiredCell(
  row: RawImportRow,
  field: CollectionCsvHeader,
  context: ErrorContext,
): string {
  const value = normalizedCell(row[field] ?? "");

  if (value === null) {
    throw new CollectionCsvError("is required and cannot be blank", {
      ...context,
      field,
    });
  }

  return value;
}

function parseInteger(
  value: string | null,
  field: CollectionCsvHeader,
  context: ErrorContext,
  options: { optional: true; minimum: number },
): number | null;
function parseInteger(
  value: string,
  field: CollectionCsvHeader,
  context: ErrorContext,
  options: { optional?: false; minimum: number },
): number;
function parseInteger(
  value: string | null,
  field: CollectionCsvHeader,
  context: ErrorContext,
  options: { optional?: boolean; minimum: number },
): number | null {
  if (value === null) {
    if (options.optional) {
      return null;
    }

    throw new CollectionCsvError("is required and cannot be blank", {
      ...context,
      field,
    });
  }

  if (!/^\d+$/u.test(value)) {
    throw new CollectionCsvError(`must be an integer; received "${value}"`, {
      ...context,
      field,
    });
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < options.minimum) {
    const expectation =
      options.minimum === 0 ? "a non-negative integer" : "a positive integer";
    throw new CollectionCsvError(`${expectation}; received "${value}"`, {
      ...context,
      field,
    });
  }

  return parsed;
}

function normalizeCollectorNumber(
  collectorNumber: string,
  context: ErrorContext,
): { key: string; sort: number } {
  const match = /^(\d+)\s*\/\s*(\d+)$/u.exec(collectorNumber);

  if (!match) {
    throw new CollectionCsvError(
      `must use a numeric collector-number format such as 057/084; received "${collectorNumber}"`,
      { ...context, field: "Collector No." },
    );
  }

  const numeratorText = match[1];
  const denominatorText = match[2];
  if (numeratorText === undefined || denominatorText === undefined) {
    throw new CollectionCsvError("could not be normalized", {
      ...context,
      field: "Collector No.",
    });
  }

  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new CollectionCsvError(
      "contains a number outside JavaScript's safe integer range",
      {
        ...context,
        field: "Collector No.",
      },
    );
  }

  return {
    key: `${numerator}/${denominator}`,
    sort: numerator,
  };
}

function validateUrl(value: string, context: ErrorContext): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch (error) {
    throw new CollectionCsvError(
      `must be a valid URL; received "${value}"`,
      {
        ...context,
        field: "Collector Source",
      },
      error,
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new CollectionCsvError("must use an HTTP or HTTPS URL", {
      ...context,
      field: "Collector Source",
    });
  }

  return value;
}

function parseFinishVariant(value: string | null): {
  rarity: string | null;
  finishVariant: string | null;
  sealed: boolean;
  printingVariantKey: string;
} {
  if (value === null) {
    return {
      rarity: null,
      finishVariant: null,
      sealed: false,
      printingVariantKey: "standard",
    };
  }

  const remaining: string[] = [];
  let rarity: string | null = null;
  let sealed = false;
  let printingVariantKey = "standard";

  for (const token of value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    const tokenKey = token.toLocaleLowerCase("en-US");
    const recognizedRarity = knownRarities.get(tokenKey);

    const publishingVariant =
      /\b1st[ -]edition(?:\s+shadowless)?(?:\s+printing)?$/iu.test(tokenKey)
        ? "first-edition"
        : /\bshadowless(?:\s+printing)?$/iu.test(tokenKey)
          ? "shadowless"
          : /\b1999[ -]2000(?:\s+copyright)?(?:\s+printing)?$/iu.test(tokenKey)
            ? "1999-2000-copyright"
            : /\bunlimited(?:\s+printing)?$/iu.test(tokenKey)
              ? "unlimited"
              : null;

    if (recognizedRarity && rarity === null) {
      rarity = recognizedRarity;
    } else if (tokenKey === "factory sealed" || tokenKey === "sealed") {
      sealed = true;
    } else if (publishingVariant && printingVariantKey === "standard") {
      printingVariantKey = publishingVariant;
    } else {
      remaining.push(token);
    }
  }

  return {
    rarity,
    finishVariant: remaining.length > 0 ? remaining.join("; ") : null,
    sealed,
    printingVariantKey,
  };
}

function parseAttack(
  rawRow: RawImportRow,
  position: 1 | 2,
  context: ErrorContext,
): ParsedAttack | null {
  const nameField = `Attack ${position} Name` as const;
  const costField = `Attack ${position} Cost` as const;
  const damageField = `Attack ${position} Damage` as const;
  const effectField = `Attack ${position} Effect` as const;
  const name = normalizedCell(rawRow[nameField] ?? "");
  const cost = normalizedCell(rawRow[costField] ?? "");
  const damage = normalizedCell(rawRow[damageField] ?? "");
  const effect = normalizedCell(rawRow[effectField] ?? "");

  if (name === null) {
    const orphanedField = [
      [costField, cost],
      [damageField, damage],
      [effectField, effect],
    ].find((entry) => entry[1] !== null);

    if (orphanedField) {
      throw new CollectionCsvError(`has a value but "${nameField}" is blank`, {
        ...context,
        field: orphanedField[0] as CollectionCsvHeader,
      });
    }

    return null;
  }

  if (cost === null) {
    throw new CollectionCsvError(`is required when "${nameField}" is present`, {
      ...context,
      field: costField,
    });
  }

  return {
    position,
    name,
    cost: cost.split(/\s+/u),
    damage,
    effect,
  };
}

function rawRowFromRecord(record: string[]): RawImportRow {
  const rawRow: RawImportRow = {};

  COLLECTION_CSV_HEADERS.forEach((header, index) => {
    rawRow[header] = record[index] ?? "";
  });

  return rawRow;
}

function validateHeaders(receivedHeaders: string[]): void {
  const maxLength = Math.max(
    receivedHeaders.length,
    COLLECTION_CSV_HEADERS.length,
  );

  for (let index = 0; index < maxLength; index += 1) {
    const expected = COLLECTION_CSV_HEADERS[index];
    const received = receivedHeaders[index];

    if (expected !== received) {
      const expectedLabel =
        expected === undefined ? "<no additional column>" : `"${expected}"`;
      const receivedLabel =
        received === undefined ? "<missing>" : `"${received}"`;
      throw new CollectionCsvError(
        `header mismatch at column ${index + 1}: expected ${expectedLabel}, received ${receivedLabel}`,
      );
    }
  }
}

function parseRecord(
  record: string[],
  csvRowNumber: number,
): ParsedCollectionRow {
  if (record.length !== COLLECTION_CSV_HEADERS.length) {
    throw new CollectionCsvError(
      `expected ${COLLECTION_CSV_HEADERS.length} fields but received ${record.length}`,
      { rowNumber: csvRowNumber },
    );
  }

  const rawRow = rawRowFromRecord(record);
  const inventoryId = requiredCell(rawRow, "Inventory ID", {
    rowNumber: csvRowNumber,
  });
  const context = { rowNumber: csvRowNumber, inventoryId };
  parseInteger(inventoryId, "Inventory ID", context, { minimum: 1 });

  const quantity = parseInteger(
    requiredCell(rawRow, "Quantity", context),
    "Quantity",
    context,
    {
      minimum: 1,
    },
  );
  const hp = parseInteger(normalizedCell(rawRow.HP ?? ""), "HP", context, {
    optional: true,
    minimum: 1,
  });
  const retreatCost = parseInteger(
    normalizedCell(rawRow["Retreat Cost"] ?? ""),
    "Retreat Cost",
    context,
    { optional: true, minimum: 0 },
  );
  const collectorNumber = requiredCell(rawRow, "Collector No.", context);
  const normalizedCollector = normalizeCollectorNumber(
    collectorNumber,
    context,
  );
  const externalReferenceUrl = validateUrl(
    requiredCell(rawRow, "Collector Source", context),
    context,
  );
  const attack1 = parseAttack(rawRow, 1, context);
  const attack2 = parseAttack(rawRow, 2, context);

  if (attack2 !== null && attack1 === null) {
    throw new CollectionCsvError("cannot be present when Attack 1 is blank", {
      ...context,
      field: "Attack 2 Name",
    });
  }

  const finish = parseFinishVariant(
    normalizedCell(rawRow["Finish / Variant"] ?? ""),
  );

  return {
    csvRowNumber,
    inventoryId,
    cardKind: requiredCell(rawRow, "Card Kind", context),
    name: requiredCell(rawRow, "Name", context),
    pokemonType: normalizedCell(rawRow["TCG Type"] ?? ""),
    subtype: requiredCell(rawRow, "Stage / Trainer Subtype", context),
    hp,
    quantity,
    specialRuleBox: normalizedCell(rawRow["Special / Rule Box"] ?? ""),
    visibleMoveOrEffect1: requiredCell(
      rawRow,
      "Visible Move / Effect 1",
      context,
    ),
    visibleMoveOrEffect2: normalizedCell(
      rawRow["Visible Move / Effect 2"] ?? "",
    ),
    identificationConfidence: requiredCell(rawRow, "ID Confidence", context),
    notes: normalizedCell(rawRow.Notes ?? ""),
    deckPool: normalizedCell(rawRow["Water/Psychic Deck Pool"] ?? ""),
    collectorNumber,
    collectorNumberKey: normalizedCollector.key,
    collectorNumberSort: normalizedCollector.sort,
    expansion: requiredCell(rawRow, "Expansion", context),
    setCode: requiredCell(rawRow, "Set ID", context),
    externalReferenceUrl,
    evolvesFrom: normalizedCell(rawRow["Evolves From"] ?? ""),
    abilityRule: normalizedCell(rawRow["Ability / Rule"] ?? ""),
    attacks: [attack1, attack2].filter(
      (attack): attack is ParsedAttack => attack !== null,
    ),
    weakness: normalizedCell(rawRow.Weakness ?? ""),
    resistance: normalizedCell(rawRow.Resistance ?? ""),
    retreatCost,
    regulationMark: normalizedCell(rawRow["Regulation Mark"] ?? ""),
    rulesText: normalizedCell(rawRow["Trainer / Other Text"] ?? ""),
    rarity: finish.rarity,
    finishVariant: finish.finishVariant,
    sealed: finish.sealed,
    printingVariantKey: finish.printingVariantKey,
    languageCode: "en",
    rawRow,
  };
}

export function parseCollectionCsv(
  input: string | Buffer,
): ParsedCollectionRow[] {
  let records: string[][];

  try {
    records = parse(input, {
      bom: true,
      columns: false,
      encoding: "utf8",
      relax_column_count: true,
      skip_empty_lines: true,
    });
  } catch (error) {
    throw new CollectionCsvError(
      `could not parse CSV: ${errorMessage(error)}`,
      {},
      error,
    );
  }

  const header = records[0];
  if (!header) {
    throw new CollectionCsvError("CSV is empty and has no header row");
  }

  validateHeaders(header);

  const parsedRows = records
    .slice(1)
    .map((record, index) => parseRecord(record, index + 2));
  const inventoryRows = new Map<string, number>();

  for (const row of parsedRows) {
    const firstRow = inventoryRows.get(row.inventoryId);
    if (firstRow !== undefined) {
      throw new CollectionCsvError(
        `duplicates Inventory ID first seen on CSV row ${firstRow}`,
        {
          rowNumber: row.csvRowNumber,
          inventoryId: row.inventoryId,
          field: "Inventory ID",
        },
      );
    }

    inventoryRows.set(row.inventoryId, row.csvRowNumber);
  }

  return parsedRows;
}
