import { getTrustedCardImageOrigins } from "./card-image-policy";

export type SecurityHeader = {
  key: string;
  value: string;
};

export function createContentSecurityPolicy({
  development,
  imageOrigins = getTrustedCardImageOrigins(),
}: {
  development: boolean;
  imageOrigins?: string[];
}): string {
  const scriptSources = ["'self'", "'unsafe-inline'"];
  const connectSources = ["'self'"];

  if (development) {
    // Next.js development HMR compiles code in the browser and uses WebSockets.
    scriptSources.push("'unsafe-eval'");
    connectSources.push("ws://127.0.0.1:*", "ws://localhost:*", "ws://[::1]:*");
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:${imageOrigins.length ? ` ${imageOrigins.join(" ")}` : ""}`,
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "manifest-src 'self'",
    "media-src 'none'",
    "worker-src 'self' blob:",
  ].join("; ");
}

export function getSecurityHeaders({
  development,
}: {
  development: boolean;
}): SecurityHeader[] {
  return [
    {
      key: "Content-Security-Policy",
      value: createContentSecurityPolicy({ development }),
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
}
