# Cardboardex

Cardboardex is a visual, local-first trading card collection manager for organizing and browsing the cards you actually own. Local collection profiles keep different owners' cards independent while sharing published card facts and artwork. The current MVP opens directly into a responsive collection grid and supports card details, search, filters, sorting, ownership edits, removal, and simple manual entry.

The current import and artwork paths support Pokémon TCG data, but the core printing and ownership model is game-agnostic. Pokémon-specific facts live in an extension table rather than defining every card game.

## Technology

- Next.js App Router, React, and strict TypeScript
- SQLite through `better-sqlite3`
- Drizzle ORM and checked-in SQL migrations
- Zod for mutation validation and `csv-parse` for collection imports
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

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). `db:setup` applies migrations and creates a fresh, empty **My Collection** profile; no database file needs to be created manually. Import a personal CSV with the workflow below when you are ready to add cards.

The default database is `data/cardboardex.sqlite` and is intentionally ignored by Git. Set `CARDBOARDEX_DB_PATH` to use a different location.

### Collection profiles

A profile answers “whose collection is this?” It is a local ownership container, not a login, account, permission boundary, language, game, or era. Use the collection selector in the header to switch profiles; its Manage panel creates, renames, duplicates, and deletes profiles. A profile's canonical URL/CLI slug follows its display name (`Thomas` becomes `thomas`). Renaming retains the prior slug as a compatibility alias, so old bookmarks and commands continue to resolve while the UI emits the new canonical slug. Duplicating a collection creates independent OwnedCards and provenance while reusing shared CardPrintings and artwork. Deleting a collection removes only its profile-scoped ownership/provenance; shared card metadata remains, and the final remaining collection cannot be deleted. The browser remembers the selected profile locally and switches to a deterministic remaining collection after deletion.

Fresh setup creates an empty **My Collection** profile. Existing databases are migrated in place without resetting or re-importing cards. A legacy renamed default profile is promoted from `my-collection` to its name-derived canonical slug while `my-collection` remains an alias. Each profile can contain a mixture of games, eras, and printing languages. Language belongs to the published CardPrinting, so English and Japanese versions remain distinct even when they depict the same Pokémon.

### Common commands

| Command                          | Purpose                                                         |
| -------------------------------- | --------------------------------------------------------------- |
| `npm run db:init`                | Create/update the SQLite schema without importing cards         |
| `npm run collection:sync -- ...` | Preview or update one personal collection from its complete CSV |
| `npm run db:import -- ...`       | Advanced import with an explicit provenance source key          |
| `npm run db:setup`               | Initialize a fresh checkout with an empty collection            |
| `npm run db:reset -- --yes`      | **Delete the local database and create an empty catalog**       |
| `npm run artwork:sync`           | Resolve trusted Pokémon artwork into the local database         |
| `npm run dev`                    | Start the development server on `127.0.0.1`                     |
| `npm run build`                  | Create a production build                                       |
| `npm start`                      | Run the production build on `127.0.0.1`                         |
| `npm test`                       | Run importer and collection behavior tests                      |
| `npm run lint`                   | Run ESLint with zero warnings allowed                           |
| `npm run typecheck`              | Run strict TypeScript checking                                  |
| `npm run format:check`           | Check formatting                                                |
| `npm run security:audit`         | Audit the complete npm dependency tree                          |
| `npm run check`                  | Run tests, lint, typecheck, and build                           |

The importer requires an explicit target profile ID internally, so separate profiles may safely reuse the same source and external inventory IDs. `db:reset` is the only destructive database command; it refuses to run without the explicit `--yes` confirmation, permanently removes local edits and manually added cards, and does not import fixture or personal data afterward.

### Updating a personal collection

Use the same workflow for Thomas, Ekah, and every future collection. Keep each private working CSV under ignored local storage, for example `data/local/thomas/collection.csv` and `data/local/ekah/collection.csv`. The whole `data/local` directory is ignored by Git; do not commit real collection CSVs, photo provenance, conditions, future valuations, private notes, or other personal ownership data.

The normal workflow is in the application:

1. Select the target collection in the header.
2. Open **Manage** and choose its complete CSV under **Update this collection from CSV**.
3. Review the preview, including new, matched, and missing-row counts.
4. Confirm the import. Cardboardex creates a timestamped SQLite backup under the database's adjacent `backups` directory before it changes anything.
5. Run `npm run artwork:sync` separately when new printings need artwork.

Rows that share an `Inventory ID` with the collection's prior CSV are updated in place, so quantity, condition, notes, and photo provenance do not duplicate. Existing imported rows absent from the new CSV are reported and deliberately preserved; CSV sync is additive/update-only, not a deletion command. A new collection receives a standard internal source key automatically. A collection migrated from an older workflow automatically keeps its sole existing source key, including Thomas's former seed key or Ekah's explicit key, so its existing ownership provenance stays attached.

The equivalent command-line fallback also chooses the safe source identity automatically:

```bash
npm run collection:sync -- \
  --profile thomas \
  --file data/local/thomas/collection.csv \
  --dry-run

npm run collection:sync -- \
  --profile thomas \
  --file data/local/thomas/collection.csv
```

Replace the profile slug and file path for any other collection, such as `--profile ekah --file data/local/ekah/collection.csv`. The profile must already exist; sync never creates one implicitly. Dry run uses the complete parser and reconciliation path, including printing ambiguity, published-fact conflicts, component validation, and provenance updates, then rolls back the transaction so no changes are committed. Its displayed totals are the projected result of the import.

Shared `CardPrinting`, set, Pokémon-detail, identifier, and attack facts are reconciled conservatively: missing input preserves known data, compatible input may enrich gaps, and contradictory known facts abort the whole import. The source-owned `OwnedCard` row remains authoritative for its ownership fields. If a profile intentionally combines more than one CSV source, the automatic workflow refuses to guess; use the advanced `db:import` command with an explicit stable `--source-key` for that profile.

Pushes and pull requests targeting `main` are validated by GitHub Actions using `npm run check` and the dependency audit. Run `npm run check` locally before sharing changes. Generated SQLite databases and personal collection CSVs are local runtime data and must never be committed. Purpose-built parser/import fixtures live under `tests/fixtures`.

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

The collection importer handles the UTF-8 BOM, quoted fields, NFC-normalized Unicode text, blanks, numeric validation, overloaded variant data, and transactional/idempotent writes. Purpose-built fixtures under `tests/fixtures` verify those behaviors without treating a real owner's collection as application seed data.

The original 33-column CSV format remains valid and defaults to English. Import files may append optional columns in this order: `Language`, `English Name`, `Catalog Provider`, `Catalog Set ID`, `Catalog Card ID`, `Printing Variant`, `Card Back Design`, `Printing Finish`, `Physical Form`, `Printed Identifiers`, `Component Group Key`, `Component Group Type`, `Component Group Name`, `Expected Component Count`, `Component Key`, `Photo Batch`, `Grid Position`, `Front Photo`, `Back Photo`, and `Condition`. Optional columns form a compatible prefix, so existing six-column international extensions and the previous 52-column cataloging format remain valid. `Language` accepts normalized codes such as `en`, `ja`, and other two-letter language/region forms; `English Name` is an optional searchable alias that does not replace the printed name. The three catalog fields are optional as a group. `Printing Variant` and `Printing Finish` store known publishing identity facts; leave them blank when the physical printing was not assessed instead of guessing. The legacy `Finish / Variant` field continues to carry rarity, sealed-state, and ownership notes for backward compatibility. `Inventory ID` is required normalized provenance text and may be numeric or a stable value such as `EKAH-20260813-B19-A3`. `Collector No.` may contain a non-numeric published identifier or be blank when the physical card is unnumbered. Additional identifiers use semicolon-separated `role: value` entries, such as `species/pokedex-number: No.004`, and never manufacture a collector number. Photo values are audit-friendly source identifiers or filenames; Cardboardex does not require those files to exist at runtime. `Condition` is optional free text stored on the source-owned ownership lot.

Catalog provider/set/card identity is optional enrichment, never a prerequisite for a legitimate locally cataloged printing. Adding a compatible exact catalog identity reconciles the existing CardPrinting in place so ownership, attacks, Pokémon details, artwork, and provenance remain attached. Conflicting identities fail transactionally rather than guessing equivalence from a card name.

Checked-in CSVs are test-only data. Keep private ownership information—such as collection snapshots, purchase history, prices paid, storage locations, addresses, identifying information, or private notes—in ignored local storage.

## Artwork

Copyrighted card images are not stored in this repository. After setting up the database, run:

```bash
npm run artwork:sync
```

The explicit, repeatable sync uses this provider order:

1. keep already stored artwork that still passes the image policy;
2. resolve stored modern card-page references through Pokémon's official card database and `assets.pokemon.com`;
3. for a printing with an exact TCGdex catalog identity, query its language-specific card record and prefer a direct `assets.tcgdex.net` image only when the response's card, set, language-specific path, local identifier, and exact visual variant all match; when an exact Japanese variant has no native image, first accept a TCGplayer image from that selected variant's single provider product identity, then for explicitly supported historical sets use TCGCSV only as a structured group/product bridge;
4. for supported English vintage sets, query structured TCGdex metadata and accept a TCGplayer image only when the requested printing variant has its own product linkage (or the source reports only one visual printing); and
5. leave the type-aware placeholder when no provider can identify the exact printing.

The vintage path currently recognizes Base Set, Jungle, Fossil, Base Set 2, and Team Rocket identities using set code/name, collector number, English language, and printing variant. It deliberately declines ambiguous shared products, including 1st Edition or Shadowless images when only an Unlimited printing is owned. Base Set 1st Edition, Shadowless, 1999–2000 copyright, and similar variants remain placeholders unless TCGdex exposes a distinct variant-to-product image linkage. This limitation is preferable to silently displaying the wrong physical printing.

Exact catalog lookup uses only constrained `https://api.tcgdex.net/v2/<language>/cards/<card-id>` requests. Direct images use the matching TCGdex asset hierarchy and are stored with provider key `tcgdex`. The older English fallback remains constrained to `/v2/en/cards/...`; its exact `https://tcgplayer-cdn.tcgplayer.com/product/..._in_1000x1000.jpg` images are stored as `tcgdex-tcgplayer`, accurately recording that TCGplayer—not Pokémon—hosts them. TCGdex's [card endpoint](https://tcgdex.dev/rest/card) documents localized card records, variants, and optional images, while TCGplayer's product image convention is exposed by the [TCGCSV product documentation](https://tcgcsv.com/docs).

Coverage is intentionally incomplete. TCGdex remains the catalog authority for vintage Japanese cards: Cardboardex verifies the exact localized TCGdex card, set, and selected variant before considering any fallback. When native artwork and usable variant-local pricing artwork are absent, an explicit TCGCSV Pokemon Japan group crosswalk currently supports PMCG1 standard → Expansion Pack (`23721`), PMCG1 no-rarity → Expansion Pack (No Rarity) (`23740`), PMCG2 → Pokemon Jungle (`23722`), PMCG4 → Rocket Gang (`23724`), and PMCG6 → Challenge from the Darkness (`23726`).

Within one mapped group, the TCGCSV bridge requires an exact normalized `canonicalName` match and corroborates available HP, rarity, stage, and Pokémon elemental-type facts from the local printing and exact TCGdex record. Pokémon stage enums are compared semantically (`Stage1` equals `Stage 1`, and likewise for `Stage2`) without fuzzy-matching unknown stages. TCGplayer's terminal `(C)`/`(U)` name suffix is ignored only when rarity independently agrees. Exactly one candidate must survive; missing canonical names, conflicting facts, unsupported sets or variants, zero matches, and ambiguous duplicate or same-name matches deliberately remain placeholders. Each artwork sync caches successfully parsed products by TCGCSV group and spaces actual TCGCSV requests by at least 250 ms; failed or non-JSON responses remain provider failures and are not cached. TCGCSV image URLs are never trusted: only the matched positive product ID is used to construct and HEAD-verify the constrained TCGplayer CDN URL, stored under artwork provider `tcgcsv-tcgplayer`. This path does not turn catalog-local IDs into purported printed collector numbers, borrow another variant's pricing, or substitute English artwork.

Successful resolutions store only a URL, provider key, and external identity on the shared CardPrinting in local SQLite. Two profiles that own the same printing therefore reuse one artwork resolution. Image binaries are never committed, downloaded into the repository, or proxied by Cardboardex. Resolved printings are skipped on later runs; unresolved cards and partial network failures remain eligible for retry. The CLI reports already resolved, newly resolved, unresolved, and failed counts. Baseline setup, tests, builds, and CI never run the network enrichment step.

Official card images are accepted only from `https://assets.pokemon.com/static-assets/content-assets/cms2/img/cards/web/...`; exact TCGdex images only from the documented `https://assets.tcgdex.net/<language>/<series>/<set>/<local-id>/<size>.<format>` shape; and vintage fallback images only from the TCGplayer path documented above. Images load directly in the browser and are never proxied by the Cardboardex web server. Missing, rejected, or failed images continue to use the type-aware placeholder. Ownership badges remain independent of reference artwork.

Additional trusted providers can still be enabled deliberately with a comma-separated list of exact public HTTPS origins in `CARDBOARDEX_TRUSTED_IMAGE_ORIGINS`. URLs outside the allowlist, non-HTTPS URLs, credentials, and local/private hosts are rejected. Production builds must be rebuilt after changing this configuration so the CSP stays aligned.

## Project structure

```text
src/app/                 Pages and JSON route handlers
src/components/          Collection, detail, editor, and artwork UI
src/db/                  Drizzle schema, connection, and migrations
src/lib/import/          Strict CSV parsing and normalized collection import
src/lib/repositories/    Typed collection reads and writes
src/lib/services/        Validation and application operations
src/lib/images/          Card-image provider boundary
src/scripts/             Database CLI commands
tests/                   Real SQLite integration tests and purpose-built fixtures
```

## Current scope and limitations

The MVP edits ownership facts without exposing published printing facts to accidental changes. Manual entry can create a language-specific, numbered or unnumbered printing, optional English alias and catalog identity, and any number of structured attacks, but it is intentionally a compact first-pass workflow. Vintage Japanese catalog and image coverage is provider-dependent; missing provider coverage never makes a local card invalid. Artwork coverage depends on exact language and variant metadata and is intentionally incomplete where a source has no scan or only an ambiguous one. There is no offline image cache. SQLite persistence assumes a local writable filesystem and is not suitable for ephemeral serverless deployment as configured.

### Future work

Likely next iterations include a provider-backed card metadata/image lookup, offline/PWA caching, richer import/export, storage locations, deck building with owned-quantity validation, and price history. Accounts, cloud sync, scanning, and multi-user support remain outside this MVP.

Future valuation should be modeled as observations rather than one timeless value on CardPrinting or OwnedCard. A later pricing boundary should retain the source, currency, as-of timestamp, exact printing, applicable condition/grade, and any low/mid/high or confidence range. This branch deliberately adds no pricing tables, providers, market API calls, or current-value fields.

## License

[MIT](LICENSE)
