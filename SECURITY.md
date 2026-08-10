# Security model

Cardboardex is currently an unauthenticated, single-user application intended only for use on the same computer where it is running. The standard development and production commands bind to `127.0.0.1`, and requests with non-loopback Host headers are rejected.

Do not expose Cardboardex directly to a LAN or the public internet. It has no accounts, authentication, authorization, or TLS deployment design. Intentional phone, LAN, or internet access will require a separate authentication and deployment-security pass before changing the loopback restrictions.

The local SQLite database can contain private collection details and is ignored by Git. Do not commit database files, environment files, or private ownership metadata. The checked-in seed CSV is a public development fixture; avoid adding future purchase history, prices paid, storage locations, addresses, identifying information, or private notes to it.

Remote artwork is disabled by default. Trusted public HTTPS image origins can be configured deliberately with `CARDBOARDEX_TRUSTED_IMAGE_ORIGINS`; Cardboardex never proxies those images through its server. The static CSP retains `unsafe-inline` because Next.js emits inline hydration scripts and image styles. `unsafe-eval` is added only in development for Next.js hot reloading and is absent from production.

To report a security issue, open a private maintainer channel rather than publishing collection data or exploit details in a public issue.
