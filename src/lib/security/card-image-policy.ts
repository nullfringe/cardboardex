const TRUSTED_IMAGE_ORIGINS_ENV = "CARDBOARDEX_TRUSTED_IMAGE_ORIGINS";

function normalizeHostname(hostname: string): string {
  return hostname
    .toLocaleLowerCase("en-US")
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "");
}

function isNonPublicIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first = -1, second = -1, third = -1] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0 && third === 113)
  );
}

export function isPublicImageHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home.arpa") ||
    normalized.endsWith(".invalid") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".onion") ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    /^f[cd]/u.test(normalized) ||
    /^fe[89ab]/u.test(normalized) ||
    isNonPublicIpv4(normalized)
  ) {
    return false;
  }

  return true;
}

function parseTrustedOrigin(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${TRUSTED_IMAGE_ORIGINS_ENV} contains an invalid URL.`);
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !isPublicImageHostname(url.hostname)
  ) {
    throw new Error(
      `${TRUSTED_IMAGE_ORIGINS_ENV} must contain only public HTTPS origins without paths.`,
    );
  }

  return url.origin;
}

export function getTrustedCardImageOrigins(
  configuredOrigins = process.env.CARDBOARDEX_TRUSTED_IMAGE_ORIGINS,
): string[] {
  if (!configuredOrigins?.trim()) return [];

  return [
    ...new Set(
      configuredOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map(parseTrustedOrigin),
    ),
  ];
}

export function isTrustedCardImageUrl(
  value: string,
  trustedOrigins = getTrustedCardImageOrigins(),
): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      isPublicImageHostname(url.hostname) &&
      trustedOrigins.includes(url.origin)
    );
  } catch {
    return false;
  }
}
