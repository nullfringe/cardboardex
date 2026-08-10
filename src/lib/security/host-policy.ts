const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "");
}

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(normalizeHostname(hostname));
}

export function requestOrigin(request: Request): URL | null {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") ?? requestUrl.host;

  try {
    const origin = new URL(`${requestUrl.protocol}//${host}`);
    if (
      origin.username ||
      origin.password ||
      !isLoopbackHostname(origin.hostname)
    ) {
      return null;
    }

    return origin;
  } catch {
    return null;
  }
}

export function isLoopbackRequest(request: Request): boolean {
  return requestOrigin(request) !== null;
}
