import path from "node:path";

export const RESET_CONFIRMATION_FLAG = "--yes";

function isWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function assertSafeResetTarget(databasePath: string): string {
  const resolvedPath = path.resolve(databasePath);
  const parsedPath = path.parse(resolvedPath);
  const allowedExtensions = new Set([".db", ".sqlite", ".sqlite3"]);
  const protectedDirectories = [path.resolve(process.cwd(), ".git")];

  if (
    resolvedPath === parsedPath.root ||
    resolvedPath === path.resolve(process.cwd()) ||
    !allowedExtensions.has(parsedPath.ext.toLocaleLowerCase()) ||
    protectedDirectories.some((directory) => isWithin(resolvedPath, directory))
  ) {
    throw new Error(
      `Refusing to reset unsafe database target: ${resolvedPath}. Expected an explicit .db, .sqlite, or .sqlite3 file outside protected project directories.`,
    );
  }

  return resolvedPath;
}

export function assertResetConfirmed(
  arguments_: string[],
  databasePath: string,
): void {
  if (!arguments_.includes(RESET_CONFIRMATION_FLAG)) {
    throw new Error(
      [
        `Refusing to delete ${databasePath} without explicit confirmation.`,
        `Run: npm run db:reset -- ${RESET_CONFIRMATION_FLAG}`,
        "This permanently removes local edits and manually added cards before creating an empty catalog.",
      ].join("\n"),
    );
  }
}
