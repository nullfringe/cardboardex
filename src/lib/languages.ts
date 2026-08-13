const LANGUAGE_NAMES = new Map([
  ["en", "English"],
  ["ja", "Japanese"],
]);

export function languageName(languageCode: string): string {
  const normalized = languageCode.toLocaleLowerCase("en-US");
  return (
    LANGUAGE_NAMES.get(normalized) ?? normalized.toLocaleUpperCase("en-US")
  );
}

export function languageBadge(languageCode: string): string {
  return languageCode.toLocaleUpperCase("en-US");
}
