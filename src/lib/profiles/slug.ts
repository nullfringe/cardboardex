export function profileSlugFromName(value: string): string {
  return (
    value
      .normalize("NFKD")
      .toLocaleLowerCase("en-US")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "collection"
  );
}
