# Cardboardex

Cardboardex is a visual, local-first trading card collection manager for organizing and browsing the cards you actually own. Local collection profiles keep different owners' cards independent while sharing published card facts and artwork. The current MVP opens directly into a responsive collection grid and supports card details, search, filters, sorting, ownership edits, removal, and simple manual entry.

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

### Collection profiles

A profile answers “whose collection is this?” It is a local ownership container, not a login, account, permission boundary, language, game, or era. Use the collection selector in the header to switch profiles; its Manage panel creates, renames, duplicates, and deletes profiles. Duplicating a collection creates independent OwnedCards and provenance while reusing shared CardPrintings and artwork. Deleting a collection removes only its profile-scoped ownership/provenance; shared card metadata remains, and the final remaining collection cannot be deleted. The browser remembers the selected profile locally and switches to a deterministic remaining collection after deletion.

Fresh setup creates **My Collection** and imports the seed into it. An existing single-collection database is migrated into that same default profile without resetting or re-importing its cards. Each profile can contain a mixture of games, eras, and printing languages. Language belongs to the published CardPrinting, so English and Japanese versions remain distinct even when they depict the same Pokémon.

### Common commands

| Command                     | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `npm run db:init`           | Create/update the SQLite schema without importing cards            |
| `npm run db:import -- ...`  | Import an evolving CSV into one explicit existing profile          |
| `npm run db:seed`           | Apply migrations and repeatably import the seed CSV                |
| `npm run db:setup`          | Initialize and seed a fresh checkout                               |
| `npm run db:reset -- --yes` | **Delete the local database and rebuild it from the seed fixture** |
| `npm run artwork:sync`      | Resolve trusted Pokémon artwork into the local database            |
| `npm run dev`               | Start the development server on `127.0.0.1`                        |
| `npm run build`             | Create a production build                                          |
| `npm start`                 | Run the production build on `127.0.0.1`                            |
| `npm test`                  | Run importer and collection behavior tests                         |
| `npm run lint`              | Run ESLint with zero warnings allowed                              |
| `npm run typecheck`         | Run strict TypeScript checking                                     |
| `npm run format:check`      | Check formatting                                                   |
| `npm run security:audit`    | Audit the complete npm dependency tree                             |
| `npm run check`             | Run tests, lint, typecheck, and build                              |

`db:seed` targets the default profile and uses profile-aware import provenance to update fixture-backed entries instead of duplicating them. It never resets the database. The importer requires an explicit target profile ID, so separate profiles may safely reuse the same source and external inventory IDs. `db:reset` is the only destructive database command; it refuses to run without the explicit `--yes` confirmation and permanently removes local edits and manually added cards.

### Importing a real collection

Keep private collection working data under ignored local storage, for example `data/local/ekah/collection.csv`. Do not put real collection CSVs, photo provenance, conditions, future valuations, private notes, or other personal ownership data in `data/seed`; that directory contains only the public development fixture.

First run the real importer as a dry run:

```bash
npm run db:import -- \
  --profile ekah \
  --file data/local/ekah/collection.csv \
  --source-key ekah-collection \
  --dry-run
```

If validation succeeds, run the corresponding import without `--dry-run`:

```bash
npm run db:import -- \
  --profile ekah \
  --file data/local/ekah/collection.csv \
  --source-key ekah-collection
```

The profile slug must identify an existing profile; import never creates one implicitly. Keep the source key stable across evolving versions of the same collection even when filenames change. Within that profile and source key, a normalized textual `Inventory ID` identifies the same source-owned ownership lot, so later imports update its quantity, condition, notes, and photo provenance instead of duplicating it. Different profiles remain independent and may reuse the same source key and Inventory ID.

Dry run uses the complete parser and reconciliation path, including printing ambiguity, published-fact conflicts, component validation, and provenance updates, then rolls back the transaction so no changes are committed. Shared `CardPrinting`, set, Pokémon-detail, identifier, and attack facts are reconciled conservatively: missing input preserves known data, compatible input may enrich gaps, and contradictory known facts abort the whole import. The source-owned `OwnedCard` row remains authoritative for its own ownership fields. `db:seed` remains the development-fixture loader and does not replace this explicit real-collection workflow.

Pushes and pull requests targeting `main` are validated by GitHub Actions using `npm run check` and the dependency audit. Run `npm run check` locally before sharing changes. Generated SQLite databases are local runtime data and must never be committed; `data/seed/collection.csv` is the intentionally version-controlled development fixture.

## Data model

A **Profile** identifies whose local collection it is. A **CardPrinting** is a global published identity: game, language-aware release, optional primary collector identifier, printing variant, published finish/treatment, card-back design, physical form, printed rules, semantic printed identifiers, optional component-group membership, and optional game-specific details. An **OwnedCard** connects one profile to a printing and stores one ownership lot's quantity, condition, sealed state, personal notes, legacy free-text finish note, and photo/import provenance. Different profiles can own the same canonical printing with completely independent ownership facts. Publishing differences such as Base Set Unlimited, Shadowless, 1st Edition, holo treatment, oversize form, and provider-confirmed Japanese no-rarity variants belong to the printing identity rather than the ownership finish text.

More than one OwnedCard may point from the same profile to the same CardPrinting. This intentionally represents condition lots without inventing printings—for example, three Near Mint copies and two Moderately Played copies are two ownership rows totaling five physical cards. Separate physical components in a published multi-card object remain independently ownable CardPrintings; a generic group records their component keys and optional expected count without modeling game rules.

The human-facing collector identifier is deliberately separate from the deterministic internal identity. A provider-backed printing uses its exact catalog identity, language, and variant; a numbered printing uses game, release, language, normalized published identifier, and variant; and an unnumbered manual printing falls back to those scoped release facts plus its normalized printed name. Card names alone are never a global identity. This allows a historical card with no printed set number to remain `null` rather than receiving a fabricated value.

The normalized schema contains:

- games and language-aware card sets, with optional catalog provenance;
- card printings, with a stable internal identity, optional published collector identifier, language, variant discriminator, finish/treatment, card-back design, physical form, and optional catalog provenance;
- generic semantic identifiers visibly printed on a card, kept separate from both collector numbers and catalog-local IDs;
- optional generic printing groups whose components remain separate CardPrintings;
- optional Pokémon details;
- ordered, structured attack rows with cost, damage, and effect;
- profiles containing only local owner identity;
- profile-scoped owned-card lots containing quantity, condition, personal facts, and optional photo filenames/batch positions; and
- profile-scoped import provenance retaining every original CSV field and a source hash.

The seed fixture lives at [`data/seed/collection.csv`](data/seed/collection.csv). Its importer handles the UTF-8 BOM, quoted fields, NFC-normalized Unicode text, blanks, numeric validation, overloaded variant data, and transactional/idempotent writes. The fixture currently derives to 69 collection entries and 72 physical cards; tests assert those fixture acceptance totals rather than embedding them in application logic.

The original 33-column CSV format remains valid and defaults to English. Import files may append optional columns in this order: `Language`, `English Name`, `Catalog Provider`, `Catalog Set ID`, `Catalog Card ID`, `Printing Variant`, `Card Back Design`, `Printing Finish`, `Physical Form`, `Printed Identifiers`, `Component Group Key`, `Component Group Type`, `Component Group Name`, `Expected Component Count`, `Component Key`, `Photo Batch`, `Grid Position`, `Front Photo`, `Back Photo`, and `Condition`. Optional columns form a compatible prefix, so existing six-column international extensions and the previous 52-column cataloging format remain valid. `Language` accepts normalized codes such as `en`, `ja`, and other two-letter language/region forms; `English Name` is an optional searchable alias that does not replace the printed name. The three catalog fields are optional as a group. `Inventory ID` is required normalized provenance text and may be numeric or a stable value such as `EKAH-20260813-B19-A3`. `Collector No.` may contain a non-numeric published identifier or be blank when the physical card is unnumbered. Additional identifiers use semicolon-separated `role: value` entries, such as `species/pokedex-number: No.004`, and never manufacture a collector number. Photo values are audit-friendly source identifiers or filenames; Cardboardex does not require those files to exist at runtime. `Condition` is optional free text stored on the source-owned ownership lot.

Catalog provider/set/card identity is optional enrichment, never a prerequisite for a legitimate locally cataloged printing. Adding a compatible exact catalog identity reconciles the existing CardPrinting in place so ownership, attacks, Pokémon details, artwork, and provenance remain attached. Conflicting identities fail transactionally rather than guessing equivalence from a card name.

The checked-in CSV is intentionally public development data. Do not add future private ownership information—such as purchase history, prices paid, storage locations, addresses, identifying information, or private notes—without first moving that data to local-only storage.

## Artwork

Copyrighted card images are not stored in this repository. After setting up the database, run:

```bash
npm run artwork:sync
```

The explicit, repeatable sync uses this provider order:

1. keep already stored artwork that still passes the image policy;
2. resolve stored modern card-page references through Pokémon's official card database and `assets.pokemon.com`;
3. for a printing with an exact TCGdex catalog identity, query its language-specific card record and accept a direct `assets.tcgdex.net` image only when the response's card, set, language-specific path, local identifier, and sole visual variant all match;
4. for supported English vintage sets, query structured TCGdex metadata and accept a TCGplayer image only when the requested printing variant has its own product linkage (or the source reports only one visual printing); and
5. leave the type-aware placeholder when no provider can identify the exact printing.

The vintage path currently recognizes Base Set, Jungle, Fossil, Base Set 2, and Team Rocket identities using set code/name, collector number, English language, and printing variant. It deliberately declines ambiguous shared products, including 1st Edition or Shadowless images when only an Unlimited printing is owned. Base Set 1st Edition, Shadowless, 1999–2000 copyright, and similar variants remain placeholders unless TCGdex exposes a distinct variant-to-product image linkage. This limitation is preferable to silently displaying the wrong physical printing.

Exact catalog lookup uses only constrained `https://api.tcgdex.net/v2/<language>/cards/<card-id>` requests. Direct images use the matching TCGdex asset hierarchy and are stored with provider key `tcgdex`. The older English fallback remains constrained to `/v2/en/cards/...`; its exact `https://tcgplayer-cdn.tcgplayer.com/product/..._in_1000x1000.jpg` images are stored as `tcgdex-tcgplayer`, accurately recording that TCGplayer—not Pokémon—hosts them. TCGdex's [card endpoint](https://tcgdex.dev/rest/card) documents localized card records, variants, and optional images, while TCGplayer's product image convention is exposed by the [TCGCSV product documentation](https://tcgcsv.com/docs).

Coverage is intentionally incomplete. Current TCGdex Japanese records for representative 1996 Expansion Pack cards such as `PMCG1-035` (ピカチュウ) and `PMCG1-043` (ケーシィ) identify the catalog cards and standard/no-rarity variants but do not provide images. Cardboardex retains these as valid unnumbered Japanese printings and shows placeholders; it does not turn TCGdex's catalog-local IDs into purported printed collector numbers or borrow English artwork. Ambiguous multi-variant records are likewise left unresolved.

Successful resolutions store only a URL, provider key, and external identity on the shared CardPrinting in local SQLite. Two profiles that own the same printing therefore reuse one artwork resolution. Image binaries are never committed, downloaded into the repository, or proxied by Cardboardex. Resolved printings are skipped on later runs; unresolved cards and partial network failures remain eligible for retry. The CLI reports already resolved, newly resolved, unresolved, and failed counts. Baseline setup, seeding, tests, builds, and CI never run the network enrichment step.

Official card images are accepted only from `https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/...`; exact TCGdex images only from the documented `https://assets.tcgdex.net/<language>/<series>/<set>/<local-id>/<size>.<format>` shape; and vintage fallback images only from the TCGplayer path documented above. Images load directly in the browser and are never proxied by the Cardboardex web server. Missing, rejected, or failed images continue to use the type-aware placeholder. Ownership badges remain independent of reference artwork.

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

The MVP edits ownership facts without exposing published printing facts to accidental changes. Manual entry can create a language-specific, numbered or unnumbered printing, optional English alias and catalog identity, and any number of structured attacks, but it is intentionally a compact first-pass workflow. Vintage Japanese catalog and image coverage is provider-dependent; missing provider coverage never makes a local card invalid. Artwork coverage depends on exact language and variant metadata and is intentionally incomplete where a source has no scan or only an ambiguous one. There is no offline image cache. SQLite persistence assumes a local writable filesystem and is not suitable for ephemeral serverless deployment as configured.

### Future work

Likely next iterations include a provider-backed card metadata/image lookup, offline/PWA caching, richer import/export, storage locations, deck building with owned-quantity validation, and price history. Accounts, cloud sync, scanning, and multi-user support remain outside this MVP.

Future valuation should be modeled as observations rather than one timeless value on CardPrinting or OwnedCard. A later pricing boundary should retain the source, currency, as-of timestamp, exact printing, applicable condition/grade, and any low/mid/high or confidence range. This branch deliberately adds no pricing tables, providers, market API calls, or current-value fields.

## License

[MIT](LICENSE)
