import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import {
  attacks,
  cardPrintings,
  cardSets,
  games,
  ownedCards,
  pokemonDetails,
} from "@/db/schema";
import type {
  CollectionDetail,
  CollectionFacetOption,
  CollectionFacets,
  CollectionFilters,
  CollectionListItem,
  CollectionListQuery,
  CollectionSort,
  CreateCollectionEntryInput,
  UpdateOwnedCardInput,
} from "@/lib/types/collection";

const defaultSort: CollectionSort = {
  field: "name",
  direction: "asc",
};

const listSelection = {
  ownedCardId: ownedCards.id,
  printingId: cardPrintings.id,
  gameSlug: games.slug,
  gameName: games.name,
  name: cardPrintings.name,
  setName: cardSets.name,
  setCode: cardSets.code,
  collectorNumber: cardPrintings.collectorNumber,
  cardKind: cardPrintings.cardKind,
  subtype: cardPrintings.subtype,
  rarity: cardPrintings.rarity,
  regulationMark: cardPrintings.regulationMark,
  pokemonType: pokemonDetails.pokemonType,
  hp: pokemonDetails.hp,
  quantity: ownedCards.quantity,
  condition: ownedCards.condition,
  finishVariant: ownedCards.finishVariant,
  sealed: ownedCards.sealed,
  imageProvider: cardPrintings.imageProvider,
  imageExternalId: cardPrintings.imageExternalId,
  imageUrl: cardPrintings.imageUrl,
};

function collectionBaseQuery(db: AppDatabase) {
  return db
    .select(listSelection)
    .from(ownedCards)
    .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
    .innerJoin(cardSets, eq(cardPrintings.setId, cardSets.id))
    .innerJoin(games, eq(cardSets.gameId, games.id))
    .leftJoin(pokemonDetails, eq(cardPrintings.id, pokemonDetails.printingId));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizedText(value: string | null | undefined): string | null {
  const normalized = value?.normalize("NFKC").trim();
  return normalized ? normalized : null;
}

export function collectorNumberKey(collectorNumber: string): string {
  return collectorNumber
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, "")
    .split("/")
    .map((part) => (/^\d+$/.test(part) ? String(Number(part)) : part))
    .join("/");
}

function collectorNumberSort(collectorNumber: string): number {
  const numerator = collectorNumber.trim().split("/", 1)[0]?.match(/\d+/)?.[0];
  return numerator ? Number(numerator) : 2_147_483_647;
}

function filterConditions(filters: CollectionFilters): SQL[] {
  const conditions: SQL[] = [];
  const search = normalizedText(filters.search);

  if (search) {
    const pattern = `%${escapeLike(search.toLocaleLowerCase("en-US"))}%`;
    const escapeCharacter = "\\";
    const searchCondition = or(
      sql`lower(${cardPrintings.name}) like ${pattern} escape ${escapeCharacter}`,
      sql`lower(${cardPrintings.collectorNumber}) like ${pattern} escape ${escapeCharacter}`,
      sql`lower(${cardSets.name}) like ${pattern} escape ${escapeCharacter}`,
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (normalizedText(filters.gameSlug)) {
    conditions.push(eq(games.slug, filters.gameSlug!.trim()));
  }
  if (normalizedText(filters.cardKind)) {
    conditions.push(eq(cardPrintings.cardKind, filters.cardKind!.trim()));
  }
  if (normalizedText(filters.pokemonType)) {
    conditions.push(
      eq(pokemonDetails.pokemonType, filters.pokemonType!.trim()),
    );
  }
  if (normalizedText(filters.setCode)) {
    conditions.push(eq(cardSets.code, filters.setCode!.trim()));
  }
  if (normalizedText(filters.subtype)) {
    conditions.push(eq(cardPrintings.subtype, filters.subtype!.trim()));
  }
  if (normalizedText(filters.rarity)) {
    conditions.push(eq(cardPrintings.rarity, filters.rarity!.trim()));
  }
  if (normalizedText(filters.finishVariant)) {
    conditions.push(
      eq(ownedCards.finishVariant, filters.finishVariant!.trim()),
    );
  }
  if (filters.sealed !== undefined) {
    conditions.push(eq(ownedCards.sealed, filters.sealed));
  }

  return conditions;
}

function primarySort(
  expression: SQLWrapper,
  direction: CollectionSort["direction"],
): SQL {
  return direction === "desc" ? desc(expression) : asc(expression);
}

function orderBy(sort: CollectionSort): SQL[] {
  const lowerName = sql`lower(${cardPrintings.name})`;
  const lowerSet = sql`lower(${cardSets.name})`;
  const lowerType = sql`lower(${pokemonDetails.pokemonType})`;
  const nullTypeLast = asc(sql`${pokemonDetails.pokemonType} is null`);
  const nullHpLast = asc(sql`${pokemonDetails.hp} is null`);

  switch (sort.field) {
    case "set":
      return [
        primarySort(lowerSet, sort.direction),
        asc(cardPrintings.collectorNumberSort),
        asc(lowerName),
        asc(ownedCards.id),
      ];
    case "collectorNumber":
      return [
        primarySort(cardPrintings.collectorNumberSort, sort.direction),
        primarySort(cardPrintings.collectorNumber, sort.direction),
        asc(lowerName),
        asc(ownedCards.id),
      ];
    case "pokemonType":
      return [
        nullTypeLast,
        primarySort(lowerType, sort.direction),
        asc(lowerName),
        asc(ownedCards.id),
      ];
    case "hp":
      return [
        nullHpLast,
        primarySort(pokemonDetails.hp, sort.direction),
        asc(lowerName),
        asc(ownedCards.id),
      ];
    case "quantity":
      return [
        primarySort(ownedCards.quantity, sort.direction),
        asc(lowerName),
        asc(ownedCards.id),
      ];
    case "name":
    default:
      return [
        primarySort(lowerName, sort.direction),
        asc(lowerSet),
        asc(cardPrintings.collectorNumberSort),
        asc(ownedCards.id),
      ];
  }
}

function facetsFromRows(
  rows: Array<{ value: string; label: string; count: number }>,
): CollectionFacetOption[] {
  return rows.map((row) => ({
    value: row.value,
    label: row.label,
    count: Number(row.count),
  }));
}

export class CollectionRepository {
  constructor(private readonly db: AppDatabase) {}

  list(query: CollectionListQuery = {}): CollectionListItem[] {
    const conditions = filterConditions(query);
    const sort = query.sort ?? defaultSort;

    return collectionBaseQuery(this.db)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(...orderBy(sort))
      .all();
  }

  getDetail(ownedCardId: number): CollectionDetail | null {
    const row = this.db
      .select({
        ...listSelection,
        printingVariantKey: cardPrintings.printingVariantKey,
        specialRuleBox: cardPrintings.specialRuleBox,
        abilityRule: cardPrintings.abilityRule,
        rulesText: cardPrintings.rulesText,
        identificationConfidence: cardPrintings.identificationConfidence,
        printingMetadata: cardPrintings.metadata,
        evolvesFrom: pokemonDetails.evolvesFrom,
        weakness: pokemonDetails.weakness,
        resistance: pokemonDetails.resistance,
        retreatCost: pokemonDetails.retreatCost,
        notes: ownedCards.notes,
        ownedMetadata: ownedCards.metadata,
        externalReferenceUrl: cardPrintings.externalReferenceUrl,
        createdAt: ownedCards.createdAt,
        updatedAt: ownedCards.updatedAt,
      })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .innerJoin(cardSets, eq(cardPrintings.setId, cardSets.id))
      .innerJoin(games, eq(cardSets.gameId, games.id))
      .leftJoin(pokemonDetails, eq(cardPrintings.id, pokemonDetails.printingId))
      .where(eq(ownedCards.id, ownedCardId))
      .get();

    if (!row) {
      return null;
    }

    const attackRows = this.db
      .select({
        id: attacks.id,
        position: attacks.position,
        name: attacks.name,
        cost: attacks.cost,
        damage: attacks.damage,
        effect: attacks.effect,
      })
      .from(attacks)
      .where(eq(attacks.printingId, row.printingId))
      .orderBy(asc(attacks.position))
      .all();

    const { ownedMetadata, printingMetadata, ...detail } = row;

    return {
      ...detail,
      identificationConfidence:
        detail.identificationConfidence ??
        printingMetadata.identificationConfidence ??
        null,
      visibleMoveOrEffect1: printingMetadata.visibleMoveOrEffect1 ?? null,
      visibleMoveOrEffect2: printingMetadata.visibleMoveOrEffect2 ?? null,
      deckPool: ownedMetadata.deckPool ?? null,
      attacks: attackRows,
    };
  }

  getFacets(): CollectionFacets {
    const count = sql<number>`count(*)`;
    const gameRows = this.db
      .select({ value: games.slug, label: games.name, count })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .innerJoin(cardSets, eq(cardPrintings.setId, cardSets.id))
      .innerJoin(games, eq(cardSets.gameId, games.id))
      .groupBy(games.slug, games.name)
      .orderBy(asc(games.name))
      .all();
    const cardKindRows = this.db
      .select({
        value: cardPrintings.cardKind,
        label: cardPrintings.cardKind,
        count,
      })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .groupBy(cardPrintings.cardKind)
      .orderBy(asc(cardPrintings.cardKind))
      .all();
    const pokemonTypeRows = this.db
      .select({
        value: pokemonDetails.pokemonType,
        label: pokemonDetails.pokemonType,
        count,
      })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .innerJoin(
        pokemonDetails,
        eq(cardPrintings.id, pokemonDetails.printingId),
      )
      .where(isNotNull(pokemonDetails.pokemonType))
      .groupBy(pokemonDetails.pokemonType)
      .orderBy(asc(pokemonDetails.pokemonType))
      .all();
    const setRows = this.db
      .select({ value: cardSets.code, label: cardSets.name, count })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .innerJoin(cardSets, eq(cardPrintings.setId, cardSets.id))
      .groupBy(cardSets.code, cardSets.name)
      .orderBy(asc(cardSets.name))
      .all();
    const subtypeRows = this.db
      .select({
        value: cardPrintings.subtype,
        label: cardPrintings.subtype,
        count,
      })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .where(isNotNull(cardPrintings.subtype))
      .groupBy(cardPrintings.subtype)
      .orderBy(asc(cardPrintings.subtype))
      .all();
    const finishRows = this.db
      .select({
        value: ownedCards.finishVariant,
        label: ownedCards.finishVariant,
        count,
      })
      .from(ownedCards)
      .where(isNotNull(ownedCards.finishVariant))
      .groupBy(ownedCards.finishVariant)
      .orderBy(asc(ownedCards.finishVariant))
      .all();
    const rarityRows = this.db
      .select({
        value: cardPrintings.rarity,
        label: cardPrintings.rarity,
        count,
      })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .where(isNotNull(cardPrintings.rarity))
      .groupBy(cardPrintings.rarity)
      .orderBy(asc(cardPrintings.rarity))
      .all();

    return {
      games: facetsFromRows(gameRows),
      cardKinds: facetsFromRows(cardKindRows),
      pokemonTypes: facetsFromRows(
        pokemonTypeRows as Array<{
          value: string;
          label: string;
          count: number;
        }>,
      ),
      sets: facetsFromRows(setRows),
      subtypes: facetsFromRows(
        subtypeRows as Array<{ value: string; label: string; count: number }>,
      ),
      finishVariants: facetsFromRows(
        finishRows as Array<{ value: string; label: string; count: number }>,
      ),
      rarities: facetsFromRows(
        rarityRows as Array<{ value: string; label: string; count: number }>,
      ),
    };
  }

  updateOwnedCard(
    ownedCardId: number,
    input: UpdateOwnedCardInput,
  ): CollectionDetail | null {
    const patch: {
      quantity?: number;
      condition?: string | null;
      finishVariant?: string | null;
      sealed?: boolean;
      notes?: string | null;
      updatedAt: SQL;
    } = {
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };

    if (input.quantity !== undefined) patch.quantity = input.quantity;
    if (input.condition !== undefined) patch.condition = input.condition;
    if (input.finishVariant !== undefined)
      patch.finishVariant = input.finishVariant;
    if (input.sealed !== undefined) patch.sealed = input.sealed;
    if (input.notes !== undefined) patch.notes = input.notes;

    const updated = this.db
      .update(ownedCards)
      .set(patch)
      .where(eq(ownedCards.id, ownedCardId))
      .returning({ id: ownedCards.id })
      .get();

    return updated ? this.getDetail(updated.id) : null;
  }

  deleteOwnedCard(ownedCardId: number): boolean {
    const deleted = this.db
      .delete(ownedCards)
      .where(eq(ownedCards.id, ownedCardId))
      .returning({ id: ownedCards.id })
      .get();

    return Boolean(deleted);
  }

  create(input: CreateCollectionEntryInput): CollectionDetail {
    const ownedCardId = this.db.transaction((tx) => {
      let game = tx
        .select({ id: games.id, name: games.name })
        .from(games)
        .where(eq(games.slug, input.gameSlug))
        .get();

      if (!game) {
        game = tx
          .insert(games)
          .values({ slug: input.gameSlug, name: input.gameName })
          .returning({ id: games.id, name: games.name })
          .get();
      }

      let cardSet = tx
        .select({ id: cardSets.id, name: cardSets.name })
        .from(cardSets)
        .where(
          and(eq(cardSets.gameId, game.id), eq(cardSets.code, input.setCode)),
        )
        .get();

      if (!cardSet) {
        cardSet = tx
          .insert(cardSets)
          .values({ gameId: game.id, code: input.setCode, name: input.setName })
          .returning({ id: cardSets.id, name: cardSets.name })
          .get();
      }

      const printingKey = collectorNumberKey(input.collectorNumber);
      const variantKey = input.printingVariantKey ?? "standard";
      let printing = tx
        .select({ id: cardPrintings.id })
        .from(cardPrintings)
        .where(
          and(
            eq(cardPrintings.setId, cardSet.id),
            eq(cardPrintings.collectorNumberKey, printingKey),
            eq(cardPrintings.printingVariantKey, variantKey),
          ),
        )
        .get();

      let createdPrinting = false;
      if (!printing) {
        const metadata = {
          ...(input.identificationConfidence
            ? { identificationConfidence: input.identificationConfidence }
            : {}),
          ...(input.visibleMoveOrEffect1
            ? { visibleMoveOrEffect1: input.visibleMoveOrEffect1 }
            : {}),
          ...(input.visibleMoveOrEffect2
            ? { visibleMoveOrEffect2: input.visibleMoveOrEffect2 }
            : {}),
        };

        printing = tx
          .insert(cardPrintings)
          .values({
            setId: cardSet.id,
            name: input.name,
            collectorNumber: input.collectorNumber,
            collectorNumberKey: printingKey,
            collectorNumberSort: collectorNumberSort(input.collectorNumber),
            printingVariantKey: variantKey,
            cardKind: input.cardKind,
            subtype: input.subtype,
            rarity: input.rarity,
            regulationMark: input.regulationMark,
            specialRuleBox: input.specialRuleBox,
            abilityRule: input.abilityRule,
            rulesText: input.rulesText,
            identificationConfidence: input.identificationConfidence,
            imageProvider: input.imageProvider,
            imageExternalId: input.imageExternalId,
            imageUrl: input.imageUrl,
            externalReferenceUrl: input.externalReferenceUrl,
            metadata,
          })
          .returning({ id: cardPrintings.id })
          .get();
        createdPrinting = true;
      }

      if (createdPrinting) {
        const hasPokemonDetails =
          input.pokemonType !== undefined ||
          input.hp !== undefined ||
          input.evolvesFrom !== undefined ||
          input.weakness !== undefined ||
          input.resistance !== undefined ||
          input.retreatCost !== undefined;

        if (hasPokemonDetails) {
          tx.insert(pokemonDetails)
            .values({
              printingId: printing.id,
              pokemonType: input.pokemonType,
              hp: input.hp,
              evolvesFrom: input.evolvesFrom,
              weakness: input.weakness,
              resistance: input.resistance,
              retreatCost: input.retreatCost,
            })
            .run();
        }

        if (input.attacks && input.attacks.length > 0) {
          tx.insert(attacks)
            .values(
              input.attacks.map((attack, index) => ({
                printingId: printing.id,
                position: index + 1,
                name: attack.name,
                cost: attack.cost ?? [],
                damage: attack.damage,
                effect: attack.effect,
              })),
            )
            .run();
        }
      }

      return tx
        .insert(ownedCards)
        .values({
          printingId: printing.id,
          quantity: input.quantity,
          condition: input.condition,
          finishVariant: input.finishVariant,
          sealed: input.sealed ?? false,
          notes: input.notes,
          metadata: input.deckPool ? { deckPool: input.deckPool } : {},
        })
        .returning({ id: ownedCards.id })
        .get().id;
    });

    const detail = this.getDetail(ownedCardId);
    if (!detail) {
      throw new Error(
        `Created collection entry ${ownedCardId} could not be read back.`,
      );
    }

    return detail;
  }
}
