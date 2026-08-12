import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export type PrintingMetadata = {
  identificationConfidence?: string;
  visibleMoveOrEffect1?: string;
  visibleMoveOrEffect2?: string;
};

export type OwnedCardMetadata = {
  deckPool?: string;
};

export type RawImportRow = Record<string, string>;

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull().unique(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const cardSets = sqliteTable(
  "card_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("card_sets_game_code_unique").on(table.gameId, table.code),
    index("card_sets_name_index").on(table.name),
  ],
);

export const cardPrintings = sqliteTable(
  "card_printings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    setId: integer("set_id")
      .notNull()
      .references(() => cardSets.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    name: text("name").notNull(),
    collectorNumber: text("collector_number").notNull(),
    collectorNumberKey: text("collector_number_key").notNull(),
    collectorNumberSort: integer("collector_number_sort").notNull(),
    printingVariantKey: text("printing_variant_key")
      .notNull()
      .default("standard"),
    languageCode: text("language_code").notNull().default("en"),
    cardKind: text("card_kind").notNull(),
    subtype: text("subtype"),
    rarity: text("rarity"),
    regulationMark: text("regulation_mark"),
    specialRuleBox: text("special_rule_box"),
    abilityRule: text("ability_rule"),
    rulesText: text("rules_text"),
    identificationConfidence: text("identification_confidence"),
    imageProvider: text("image_provider"),
    imageExternalId: text("image_external_id"),
    imageUrl: text("image_url"),
    externalReferenceUrl: text("external_reference_url"),
    metadata: text("metadata", { mode: "json" })
      .$type<PrintingMetadata>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("card_printings_identity_unique").on(
      table.setId,
      table.collectorNumberKey,
      table.printingVariantKey,
      table.languageCode,
    ),
    index("card_printings_name_index").on(table.name),
    index("card_printings_kind_index").on(table.cardKind),
  ],
);

export const pokemonDetails = sqliteTable("pokemon_details", {
  printingId: integer("printing_id")
    .primaryKey()
    .references(() => cardPrintings.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  pokemonType: text("pokemon_type"),
  hp: integer("hp"),
  evolvesFrom: text("evolves_from"),
  weakness: text("weakness"),
  resistance: text("resistance"),
  retreatCost: integer("retreat_cost"),
});

export const attacks = sqliteTable(
  "attacks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    printingId: integer("printing_id")
      .notNull()
      .references(() => cardPrintings.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    cost: text("cost", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    damage: text("damage"),
    effect: text("effect"),
  },
  (table) => [
    uniqueIndex("attacks_printing_position_unique").on(
      table.printingId,
      table.position,
    ),
    check("attacks_position_positive", sql`${table.position} > 0`),
  ],
);

export const ownedCards = sqliteTable(
  "owned_cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    printingId: integer("printing_id")
      .notNull()
      .references(() => cardPrintings.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    quantity: integer("quantity").notNull(),
    condition: text("condition"),
    finishVariant: text("finish_variant"),
    sealed: integer("sealed", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    metadata: text("metadata", { mode: "json" })
      .$type<OwnedCardMetadata>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("owned_cards_quantity_positive", sql`${table.quantity} > 0`),
    uniqueIndex("owned_cards_id_profile_unique").on(table.id, table.profileId),
    index("owned_cards_profile_printing_index").on(
      table.profileId,
      table.printingId,
    ),
    index("owned_cards_printing_index").on(table.printingId),
  ],
);

export const importRecords = sqliteTable(
  "import_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id").notNull(),
    sourceKey: text("source_key").notNull(),
    externalInventoryId: text("external_inventory_id").notNull(),
    ownedCardId: integer("owned_card_id").notNull(),
    rawRow: text("raw_row", { mode: "json" }).$type<RawImportRow>().notNull(),
    sourceHash: text("source_hash").notNull(),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("import_records_source_inventory_unique").on(
      table.profileId,
      table.sourceKey,
      table.externalInventoryId,
    ),
    uniqueIndex("import_records_owned_card_unique").on(table.ownedCardId),
    foreignKey({
      columns: [table.ownedCardId, table.profileId],
      foreignColumns: [ownedCards.id, ownedCards.profileId],
      name: "import_records_owned_card_profile_fk",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);
