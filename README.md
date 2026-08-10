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

## Local setup

Requires Node.js 20.9 or newer.

```bash
npm install
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `db:setup` applies migrations and imports `data/seed/collection.csv`; no database file needs to be created manually.

The default database is `data/cardboardex.sqlite` and is intentionally ignored by Git. Set `CARDBOARDEX_DB_PATH` to use a different location.

### Common commands

| Command                | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run db:init`      | Create/update the SQLite schema without importing cards            |
| `npm run db:seed`      | Apply migrations and repeatably import the seed CSV                |
| `npm run db:setup`     | Initialize and seed a fresh checkout                               |
| `npm run db:reset`     | **Delete the local database and rebuild it from the seed fixture** |
| `npm run dev`          | Start the development server                                       |
| `npm run build`        | Create a production build                                          |
| `npm start`            | Run the production build                                           |
| `npm test`             | Run importer and collection behavior tests                         |
| `npm run lint`         | Run ESLint with zero warnings allowed                              |
| `npm run typecheck`    | Run strict TypeScript checking                                     |
| `npm run format:check` | Check formatting                                                   |
| `npm run check`        | Run tests, lint, typecheck, and build                              |

`db:seed` uses import provenance to update fixture-backed entries instead of duplicating them. `db:reset` is destructive to the selected local SQLite file, including manually added cards.

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

## Artwork

Copyrighted third-party card artwork is not stored in this repository. Card image metadata is isolated behind `src/lib/images/card-image-provider.ts`. The MVP displays an optional stored remote image URL and falls back to a type-aware card-face placeholder on missing or failed images. `Collector Source` URLs from the CSV remain reference links and are not treated as image URLs or scraped.

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

The MVP edits ownership facts without exposing published printing facts to accidental changes. Manual entry can create a printing and any number of structured attacks, but it is intentionally a compact first-pass workflow. Images must currently be supplied as permitted direct URLs; there is no third-party metadata integration or offline image cache yet. SQLite persistence assumes a local writable filesystem and is not suitable for ephemeral serverless deployment as configured.

### Future work

Likely next iterations include a provider-backed card metadata/image lookup, offline/PWA caching, richer import/export, storage locations, deck building with owned-quantity validation, and price history. Accounts, cloud sync, scanning, and multi-user support remain outside this MVP.

## License

[MIT](LICENSE)
