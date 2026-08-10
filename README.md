# Cardboardex

Cardboardex is a visual, local-first trading card collection manager for organizing and browsing the cards you actually own. The current MVP opens directly into a responsive collection grid and supports card details, search, filters, sorting, ownership edits, removal, and simple manual entry.

The included collection is Pokémon TCG data, but the core printing and ownership model is game-agnostic. Pokémon-specific facts live in an extension table rather than defining every card game.

## Technology

- Next.js App Router, React, and strict TypeScript
- SQLite through `better-sqlite3`
- Drizzle ORM and checked-in SQL migrations
- Zod for mutation validation and `csv-parse` for the seed adapter
- Vitest for importer and collection integration tests
- Plain responsive CSS, with no external artwork bundled in the repository

This is deliberately a single-process, single-user local application. It does not need Docker, authentication, or a separate API service.

> **Security boundary:** Cardboardex has no authentication and is currently intended for localhost-only use. The standard commands bind to `127.0.0.1`; do not expose the application directly to a LAN or the public internet. See [SECURITY.md](SECURITY.md).

## Local setup

Requires Node.js 20.9 or newer.

```bash
npm install
npm run db:setup
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). `db:setup` applies migrations and imports `data/seed/collection.csv`; no database file needs to be created manually.

The default database is `data/cardboardex.sqlite` and is intentionally ignored by Git. Set `CARDBOARDEX_DB_PATH` to use a different location.

### Common commands

| Command                     | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `npm run db:init`           | Create/update the SQLite schema without importing cards            |
| `npm run db:seed`           | Apply migrations and repeatably import the seed CSV                |
| `npm run db:setup`          | Initialize and seed a fresh checkout                               |
| `npm run db:reset -- --yes` | **Delete the local database and rebuild it from the seed fixture** |
| `npm run artwork:sync`      | Resolve official Pokémon artwork into the local database           |
| `npm run dev`               | Start the development server on `127.0.0.1`                        |
| `npm run build`             | Create a production build                                          |
| `npm start`                 | Run the production build on `127.0.0.1`                            |
| `npm test`                  | Run importer and collection behavior tests                         |
| `npm run lint`              | Run ESLint with zero warnings allowed                              |
| `npm run typecheck`         | Run strict TypeScript checking                                     |
| `npm run format:check`      | Check formatting                                                   |
| `npm run security:audit`    | Audit the complete npm dependency tree                             |
| `npm run check`             | Run tests, lint, typecheck, and build                              |

`db:seed` uses import provenance to update fixture-backed entries instead of duplicating them. It never resets the database. `db:reset` is the only destructive database command; it refuses to run without the explicit `--yes` confirmation and permanently removes local edits and manually added cards.

Pushes and pull requests targeting `main` are validated by GitHub Actions using `npm run check` and the dependency audit. Run `npm run check` locally before sharing changes. Generated SQLite databases are local runtime data and must never be committed; `data/seed/collection.csv` is the intentionally version-controlled development fixture.

## Data model

A **CardPrinting** is a published identity: game, set, collector number, printed rules, and optional game-specific details. An **OwnedCard** is one collection entry pointing to that printing: quantity, condition, finish or variant, sealed state, and personal notes. Multiple owned entries can refer to the same printing when copies differ.

The normalized schema contains:

- games and card sets;
- card printings, with a stable game/set/collector identity and variant discriminator;
- optional Pokémon details;
- ordered, structured attack rows with cost, damage, and effect;
- owned cards containing only collection-specific facts; and
- import provenance retaining every original CSV field and a source hash.

The seed fixture lives at [`data/seed/collection.csv`](data/seed/collection.csv). Its importer handles the UTF-8 BOM, quoted fields, Unicode text, blanks, numeric validation, overloaded variant data, and transactional/idempotent writes. The fixture currently derives to 69 collection entries and 72 physical cards; tests assert those fixture acceptance totals rather than embedding them in application logic.

The checked-in CSV is intentionally public development data. Do not add future private ownership information—such as purchase history, prices paid, storage locations, addresses, identifying information, or private notes—without first moving that data to local-only storage.

## Artwork

Copyrighted card images are not stored in this repository. After setting up the database, run:

```bash
npm run artwork:sync
```

This explicit, repeatable command visits only the official `https://www.pokemon.com/us/pokemon-tcg/pokemon-cards/series/...` references already stored on Pokémon TCG printings. It reads the page's image metadata and stores the matching official card URL, provider key, and external ID in the local SQLite database. Resolved printings are skipped on later runs, while network failures or pages without matching metadata remain eligible for a later retry. Baseline setup, seeding, tests, builds, and CI never run the network enrichment step.

Official card images are accepted only from `https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/...`. Images load directly in the browser and are never fetched or proxied by the Cardboardex web server. Missing, rejected, or failed images continue to use the type-aware placeholder. An owned stamped or sealed variant may therefore show the official underlying printing image while its ownership badges remain unchanged; printings without an official Pokémon source remain placeholders.

Additional trusted providers can still be enabled deliberately with a comma-separated list of exact public HTTPS origins in `CARDBOARDEX_TRUSTED_IMAGE_ORIGINS`. URLs outside the allowlist, non-HTTPS URLs, credentials, and local/private hosts are rejected. Production builds must be rebuilt after changing this configuration so the CSP stays aligned.

## Project structure

```text
src/app/                 Pages and JSON route handlers
src/components/          Collection, detail, editor, and artwork UI
src/db/                  Drizzle schema, connection, and migrations
src/lib/import/          Strict CSV parsing and normalized seed import
src/lib/repositories/    Typed collection reads and writes
src/lib/services/        Validation and application operations
src/lib/images/          Card-image provider boundary
src/scripts/             Database CLI commands
tests/                   Real SQLite integration tests
data/seed/               Versioned CSV development fixture
```

## Current scope and limitations

The MVP edits ownership facts without exposing published printing facts to accidental changes. Manual entry can create a printing and any number of structured attacks, but it is intentionally a compact first-pass workflow. Official artwork resolution is currently limited to stored Pokémon card-database references, and there is no offline image cache. SQLite persistence assumes a local writable filesystem and is not suitable for ephemeral serverless deployment as configured.

### Future work

Likely next iterations include a provider-backed card metadata/image lookup, offline/PWA caching, richer import/export, storage locations, deck building with owned-quantity validation, and price history. Accounts, cloud sync, scanning, and multi-user support remain outside this MVP.

## License

[MIT](LICENSE)
