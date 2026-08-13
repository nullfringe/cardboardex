import type { CreatePrintedIdentifierInput } from "@/lib/types/collection";

export class PrintedIdentifierFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintedIdentifierFormatError";
  }
}

export function parsePrintedIdentifiers(
  value: string | null,
): CreatePrintedIdentifierInput[] {
  if (value === null) return [];

  const identifiers = value
    .split(/[;\n]+/u)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator <= 0 || separator === entry.length - 1) {
        throw new PrintedIdentifierFormatError(
          `Printed identifier "${entry}" must use role: value format.`,
        );
      }

      const role = entry
        .slice(0, separator)
        .normalize("NFKC")
        .trim()
        .toLocaleLowerCase("en-US");
      const identifierValue = entry
        .slice(separator + 1)
        .normalize("NFC")
        .trim();

      if (!/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/u.test(role)) {
        throw new PrintedIdentifierFormatError(
          `Printed identifier role "${role}" must use letters, numbers, hyphens, or single slashes.`,
        );
      }
      if (!identifierValue) {
        throw new PrintedIdentifierFormatError(
          `Printed identifier role "${role}" is missing a value.`,
        );
      }

      return { role, value: identifierValue };
    });

  const unique = new Set<string>();
  for (const identifier of identifiers) {
    const key = `${identifier.role}\u001f${identifier.value}`;
    if (unique.has(key)) {
      throw new PrintedIdentifierFormatError(
        `Printed identifier ${identifier.role}: ${identifier.value} is duplicated.`,
      );
    }
    unique.add(key);
  }

  return identifiers;
}
