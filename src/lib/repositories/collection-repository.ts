import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
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
  printingGroupMembers,
  printingGroups,
  printingIdentifiers,
  profiles,
} from "@/db/schema";
import { languageName } from "@/lib/languages";
import {
  collectorIdentifierKey,
  collectorIdentifierSort,
  stablePrintingIdentityKey,
} from "@/lib/printing-identity";
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

export class CardSetCatalogConflictError extends Error {
  constructor(
    setName: string,
    existingProvider: string,
    existingSetId: string,
    suppliedProvider: string,
    suppliedSetId: string,
  ) {
    super(
      `Set ${setName} is already linked to ${existingProvider} set ${existingSetId}; supplied ${suppliedProvider} set ${suppliedSetId} conflicts.`,
    );
    this.name = "CardSetCatalogConflictError";
  }
}

export class CardPrintingCatalogConflictError extends Error {
  constructor(name: string, existing: string, supplied: string) {
    super(
      `${name} is already linked to catalog identity ${existing}; supplied ${supplied} conflicts.`,
    );
    this.name = "CardPrintingCatalogConflictError";
  }
}

export class PrintingGroupConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintingGroupConflictError";
  }
}

const listSelection = {
  ownedCardId: ownedCards.id,
  printingId: cardPrintings.id,
  profileSlug: profiles.slug,
  profileName: profiles.name,
  gameSlug: games.slug,
  gameName: games.name,
  name: cardPrintings.name,
  canonicalName: cardPrintings.canonicalName,
  setName: cardSets.name,
  setCode: cardSets.code,
  collectorNumber: cardPrintings.collectorNumber,
  languageCode: cardPrintings.languageCode,
  printingVariantKey: cardPrintings.printingVariantKey,
  printingFinish: cardPrintings.printingFinish,
  cardBackDesign: cardPrintings.cardBackDesign,
  physicalForm: cardPrintings.physicalForm,
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
  printedIdentifierText: sql<
    string | null
  >`(select group_concat(${printingIdentifiers.role} || ' ' || ${printingIdentifiers.value}, ' ') from ${printingIdentifiers} where ${printingIdentifiers.printingId} = ${cardPrintings.id})`,
};

function collectionBaseQuery(db: AppDatabase) {
  return db
    .select(listSelection)
    .from(ownedCards)
    .innerJoin(profiles, eq(ownedCards.profileId, profiles.id))
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

function filterConditions(filters: CollectionFilters): SQL[] {
  const conditions: SQL[] = [];
  const search = normalizedText(filters.search);

  if (search) {
    const pattern = `%${escapeLike(search.toLocaleLowerCase("en-US"))}%`;
    const escapeCharacter = "\\";
    const searchCondition = or(
      sql`lower(${cardPrintings.name}) like ${pattern} escape ${escapeCharacter}`,
      sql`lower(${cardPrintings.canonicalName}) like ${pattern} escape ${escapeCharacter}`,
      sql`lower(${cardPrintings.collectorNumber}) like ${pattern} escape ${escapeCharacter}`,
      sql`lower(${cardSets.name}) like ${pattern} escape ${escapeCharacter}`,
      sql`exists (select 1 from ${printingIdentifiers} where ${printingIdentifiers.printingId} = ${cardPrintings.id} and (lower(${printingIdentifiers.role}) like ${pattern} escape ${escapeCharacter} or lower(${printingIdentifiers.value}) like ${pattern} escape ${escapeCharacter}))`,
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (normalizedText(filters.gameSlug)) {
    conditions.push(eq(games.slug, filters.gameSlug!.trim()));
  }
  if (normalizedText(filters.languageCode)) {
    conditions.push(
      eq(cardPrintings.languageCode, filters.languageCode!.trim()),
    );
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
  if (normalizedText(filters.printingFinish)) {
    conditions.push(
      eq(cardPrintings.printingFinish, filters.printingFinish!.trim()),
    );
  }
  if (normalizedText(filters.cardBackDesign)) {
    conditions.push(
      eq(cardPrintings.cardBackDesign, filters.cardBackDesign!.trim()),
    );
  }
  if (normalizedText(filters.physicalForm)) {
    conditions.push(
      eq(cardPrintings.physicalForm, filters.physicalForm!.trim()),
    );
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
  const nullCollectorLast = asc(sql`${cardPrintings.collectorNumber} is null`);

  switch (sort.field) {
    case "set":
      return [
        primarySort(lowerSet, sort.direction),
        nullCollectorLast,
        asc(cardPrintings.collectorNumberSort),
        asc(lowerName),
        asc(ownedCards.id),
      ];
    case "collectorNumber":
      return [
        nullCollectorLast,
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

  list(
    profileId: number,
    query: CollectionListQuery = {},
  ): CollectionListItem[] {
    const conditions = [
      eq(ownedCards.profileId, profileId),
      ...filterConditions(query),
    ];
    const sort = query.sort ?? defaultSort;

    return collectionBaseQuery(this.db)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(...orderBy(sort))
      .all();
  }

  getDetail(profileId: number, ownedCardId: number): CollectionDetail | null {
    const row = this.db
      .select({
        ...listSelection,
        stableIdentityKey: cardPrintings.stableIdentityKey,
        catalogProvider: cardPrintings.catalogProvider,
        catalogExternalId: cardPrintings.catalogExternalId,
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
      .innerJoin(profiles, eq(ownedCards.profileId, profiles.id))
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .innerJoin(cardSets, eq(cardPrintings.setId, cardSets.id))
      .innerJoin(games, eq(cardSets.gameId, games.id))
      .leftJoin(pokemonDetails, eq(cardPrintings.id, pokemonDetails.printingId))
      .where(
        and(
          eq(ownedCards.profileId, profileId),
          eq(ownedCards.id, ownedCardId),
        ),
      )
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

    const identifierRows = this.db
      .select({
        id: printingIdentifiers.id,
        role: printingIdentifiers.role,
        value: printingIdentifiers.value,
        label: printingIdentifiers.label,
      })
      .from(printingIdentifiers)
      .where(eq(printingIdentifiers.printingId, row.printingId))
      .orderBy(asc(printingIdentifiers.id))
      .all();

    const groupRows = this.db
      .select({
        id: printingGroups.id,
        groupKey: printingGroups.groupKey,
        groupType: printingGroups.groupType,
        name: printingGroups.name,
        expectedComponentCount: printingGroups.expectedComponentCount,
        componentKey: printingGroupMembers.componentKey,
      })
      .from(printingGroupMembers)
      .innerJoin(
        printingGroups,
        eq(printingGroupMembers.groupId, printingGroups.id),
      )
      .where(eq(printingGroupMembers.printingId, row.printingId))
      .orderBy(asc(printingGroups.id))
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
      photoBatch: ownedMetadata.photoBatch ?? null,
      gridPosition: ownedMetadata.gridPosition ?? null,
      frontPhoto: ownedMetadata.frontPhoto ?? null,
      backPhoto: ownedMetadata.backPhoto ?? null,
      attacks: attackRows,
      printedIdentifiers: identifierRows,
      printingGroups: groupRows,
    };
  }

  getFacets(profileId: number): CollectionFacets {
    const count = sql<number>`count(*)`;
    const gameRows = this.db
      .select({ value: games.slug, label: games.name, count })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .innerJoin(cardSets, eq(cardPrintings.setId, cardSets.id))
      .innerJoin(games, eq(cardSets.gameId, games.id))
      .where(eq(ownedCards.profileId, profileId))
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
      .where(eq(ownedCards.profileId, profileId))
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
      .where(
        and(
          eq(ownedCards.profileId, profileId),
          isNotNull(pokemonDetails.pokemonType),
        ),
      )
      .groupBy(pokemonDetails.pokemonType)
      .orderBy(asc(pokemonDetails.pokemonType))
      .all();
    const setRows = this.db
      .select({ value: cardSets.code, label: cardSets.name, count })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .innerJoin(cardSets, eq(cardPrintings.setId, cardSets.id))
      .where(eq(ownedCards.profileId, profileId))
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
      .where(
        and(
          eq(ownedCards.profileId, profileId),
          isNotNull(cardPrintings.subtype),
        ),
      )
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
      .where(
        and(
          eq(ownedCards.profileId, profileId),
          isNotNull(ownedCards.finishVariant),
        ),
      )
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
      .where(
        and(
          eq(ownedCards.profileId, profileId),
          isNotNull(cardPrintings.rarity),
        ),
      )
      .groupBy(cardPrintings.rarity)
      .orderBy(asc(cardPrintings.rarity))
      .all();
    const languageRows = this.db
      .select({
        value: cardPrintings.languageCode,
        label: cardPrintings.languageCode,
        count,
      })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .where(eq(ownedCards.profileId, profileId))
      .groupBy(cardPrintings.languageCode)
      .orderBy(asc(cardPrintings.languageCode))
      .all();
    const printingFinishRows = this.db
      .select({
        value: cardPrintings.printingFinish,
        label: cardPrintings.printingFinish,
        count,
      })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .where(
        and(
          eq(ownedCards.profileId, profileId),
          isNotNull(cardPrintings.printingFinish),
        ),
      )
      .groupBy(cardPrintings.printingFinish)
      .orderBy(asc(cardPrintings.printingFinish))
      .all();
    const cardBackRows = this.db
      .select({
        value: cardPrintings.cardBackDesign,
        label: cardPrintings.cardBackDesign,
        count,
      })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .where(
        and(
          eq(ownedCards.profileId, profileId),
          isNotNull(cardPrintings.cardBackDesign),
        ),
      )
      .groupBy(cardPrintings.cardBackDesign)
      .orderBy(asc(cardPrintings.cardBackDesign))
      .all();
    const physicalFormRows = this.db
      .select({
        value: cardPrintings.physicalForm,
        label: cardPrintings.physicalForm,
        count,
      })
      .from(ownedCards)
      .innerJoin(cardPrintings, eq(ownedCards.printingId, cardPrintings.id))
      .where(
        and(
          eq(ownedCards.profileId, profileId),
          isNotNull(cardPrintings.physicalForm),
        ),
      )
      .groupBy(cardPrintings.physicalForm)
      .orderBy(asc(cardPrintings.physicalForm))
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
      languages: languageRows.map((row) => ({
        value: row.value,
        label: languageName(row.value),
        count: Number(row.count),
      })),
      printingFinishes: facetsFromRows(
        printingFinishRows as Array<{
          value: string;
          label: string;
          count: number;
        }>,
      ),
      cardBackDesigns: facetsFromRows(
        cardBackRows as Array<{
          value: string;
          label: string;
          count: number;
        }>,
      ),
      physicalForms: facetsFromRows(
        physicalFormRows as Array<{
          value: string;
          label: string;
          count: number;
        }>,
      ),
    };
  }

  updateOwnedCard(
    profileId: number,
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
      .where(
        and(
          eq(ownedCards.profileId, profileId),
          eq(ownedCards.id, ownedCardId),
        ),
      )
      .returning({ id: ownedCards.id })
      .get();

    return updated ? this.getDetail(profileId, updated.id) : null;
  }

  deleteOwnedCard(profileId: number, ownedCardId: number): boolean {
    const deleted = this.db
      .delete(ownedCards)
      .where(
        and(
          eq(ownedCards.profileId, profileId),
          eq(ownedCards.id, ownedCardId),
        ),
      )
      .returning({ id: ownedCards.id })
      .get();

    return Boolean(deleted);
  }

  create(
    profileId: number,
    input: CreateCollectionEntryInput,
  ): CollectionDetail {
    const ownedCardId = this.db.transaction((tx) => {
      const languageCode = input.languageCode ?? "en";
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
        .select({
          id: cardSets.id,
          name: cardSets.name,
          catalogProvider: cardSets.catalogProvider,
          catalogExternalId: cardSets.catalogExternalId,
        })
        .from(cardSets)
        .where(
          and(
            eq(cardSets.gameId, game.id),
            eq(cardSets.code, input.setCode),
            eq(cardSets.languageCode, languageCode),
          ),
        )
        .get();

      if (!cardSet) {
        cardSet = tx
          .insert(cardSets)
          .values({
            gameId: game.id,
            code: input.setCode,
            name: input.setName,
            languageCode,
            catalogProvider: input.catalogProvider,
            catalogExternalId: input.catalogSetId,
          })
          .returning({
            id: cardSets.id,
            name: cardSets.name,
            catalogProvider: cardSets.catalogProvider,
            catalogExternalId: cardSets.catalogExternalId,
          })
          .get();
      } else if (input.catalogProvider && input.catalogSetId) {
        if (
          cardSet.catalogProvider === null &&
          cardSet.catalogExternalId === null
        ) {
          tx.update(cardSets)
            .set({
              catalogProvider: input.catalogProvider,
              catalogExternalId: input.catalogSetId,
            })
            .where(eq(cardSets.id, cardSet.id))
            .run();
        } else if (
          cardSet.catalogProvider !== input.catalogProvider ||
          cardSet.catalogExternalId !== input.catalogSetId
        ) {
          throw new CardSetCatalogConflictError(
            cardSet.name,
            cardSet.catalogProvider ?? "unknown provider",
            cardSet.catalogExternalId ?? "unknown set",
            input.catalogProvider,
            input.catalogSetId,
          );
        }
      }

      let componentGroup:
        | {
            id: number;
            groupKey: string;
            groupType: string;
            name: string | null;
            expectedComponentCount: number | null;
          }
        | undefined;
      if (input.componentGroup) {
        componentGroup = tx
          .select({
            id: printingGroups.id,
            groupKey: printingGroups.groupKey,
            groupType: printingGroups.groupType,
            name: printingGroups.name,
            expectedComponentCount: printingGroups.expectedComponentCount,
          })
          .from(printingGroups)
          .where(
            and(
              eq(printingGroups.setId, cardSet.id),
              eq(printingGroups.groupKey, input.componentGroup.groupKey),
            ),
          )
          .get();

        if (!componentGroup) {
          componentGroup = tx
            .insert(printingGroups)
            .values({
              setId: cardSet.id,
              groupKey: input.componentGroup.groupKey,
              groupType: input.componentGroup.groupType,
              name: input.componentGroup.name,
              expectedComponentCount:
                input.componentGroup.expectedComponentCount,
            })
            .returning({
              id: printingGroups.id,
              groupKey: printingGroups.groupKey,
              groupType: printingGroups.groupType,
              name: printingGroups.name,
              expectedComponentCount: printingGroups.expectedComponentCount,
            })
            .get();
        } else {
          const suppliedCount =
            input.componentGroup.expectedComponentCount ?? null;
          if (
            componentGroup.groupType !== input.componentGroup.groupType ||
            (componentGroup.name !== null &&
              input.componentGroup.name != null &&
              componentGroup.name !== input.componentGroup.name) ||
            (componentGroup.expectedComponentCount !== null &&
              suppliedCount !== null &&
              componentGroup.expectedComponentCount !== suppliedCount)
          ) {
            throw new PrintingGroupConflictError(
              `Component group ${componentGroup.groupKey} conflicts with its existing published group metadata.`,
            );
          }
          if (
            (componentGroup.name === null && input.componentGroup.name) ||
            (componentGroup.expectedComponentCount === null &&
              suppliedCount !== null)
          ) {
            tx.update(printingGroups)
              .set({
                name: componentGroup.name ?? input.componentGroup.name,
                expectedComponentCount:
                  componentGroup.expectedComponentCount ?? suppliedCount,
              })
              .where(eq(printingGroups.id, componentGroup.id))
              .run();
          }
        }
      }

      const variantKey = input.printingVariantKey ?? "standard";
      const printingKey = collectorIdentifierKey(input.collectorNumber ?? null);
      const identityInput = {
        gameSlug: input.gameSlug,
        setCode: input.setCode,
        languageCode,
        name: input.name,
        collectorNumber: input.collectorNumber ?? null,
        printingVariantKey: variantKey,
        printingFinish: input.printingFinish,
        physicalForm: input.physicalForm,
        cardBackDesign: input.cardBackDesign,
        catalogProvider: input.catalogProvider,
        catalogSetId: input.catalogSetId,
        catalogCardId: input.catalogCardId,
        componentGroupKey: input.componentGroup?.groupKey,
        componentKey: input.componentGroup?.componentKey,
      };
      const stableIdentityKey = stablePrintingIdentityKey(identityInput);
      const exactPrinting = tx
        .select({
          id: cardPrintings.id,
          setId: cardPrintings.setId,
          stableIdentityKey: cardPrintings.stableIdentityKey,
          catalogProvider: cardPrintings.catalogProvider,
          catalogExternalId: cardPrintings.catalogExternalId,
          cardBackDesign: cardPrintings.cardBackDesign,
        })
        .from(cardPrintings)
        .where(eq(cardPrintings.stableIdentityKey, stableIdentityKey))
        .get();

      const candidateConditions = [
        eq(cardPrintings.setId, cardSet.id),
        eq(cardPrintings.languageCode, languageCode),
        eq(cardPrintings.printingVariantKey, variantKey),
        input.printingFinish == null
          ? isNull(cardPrintings.printingFinish)
          : eq(cardPrintings.printingFinish, input.printingFinish),
        input.physicalForm == null
          ? isNull(cardPrintings.physicalForm)
          : eq(cardPrintings.physicalForm, input.physicalForm),
        printingKey === null
          ? and(
              isNull(cardPrintings.collectorNumberKey),
              eq(cardPrintings.name, input.name),
            )
          : eq(cardPrintings.collectorNumberKey, printingKey),
      ];
      if (input.cardBackDesign != null) {
        const compatibleBack = or(
          isNull(cardPrintings.cardBackDesign),
          eq(cardPrintings.cardBackDesign, input.cardBackDesign),
        );
        if (compatibleBack) candidateConditions.push(compatibleBack);
      }

      let candidates = tx
        .select({
          id: cardPrintings.id,
          setId: cardPrintings.setId,
          stableIdentityKey: cardPrintings.stableIdentityKey,
          catalogProvider: cardPrintings.catalogProvider,
          catalogExternalId: cardPrintings.catalogExternalId,
          cardBackDesign: cardPrintings.cardBackDesign,
        })
        .from(cardPrintings)
        .where(and(...candidateConditions))
        .all();

      if (componentGroup && input.componentGroup) {
        candidates = candidates.filter((candidate) => {
          const membership = tx
            .select({ componentKey: printingGroupMembers.componentKey })
            .from(printingGroupMembers)
            .where(
              and(
                eq(printingGroupMembers.groupId, componentGroup.id),
                eq(printingGroupMembers.printingId, candidate.id),
              ),
            )
            .get();
          return (
            membership === undefined ||
            membership.componentKey === input.componentGroup?.componentKey
          );
        });
      }

      if (
        exactPrinting &&
        !candidates.some((candidate) => candidate.id === exactPrinting.id)
      ) {
        throw new CardPrintingCatalogConflictError(
          input.name,
          exactPrinting.stableIdentityKey,
          "incompatible published printing facts",
        );
      }
      if (candidates.length > 1) {
        throw new CardPrintingCatalogConflictError(
          input.name,
          "multiple compatible local printings",
          stableIdentityKey,
        );
      }

      let printing = exactPrinting ?? candidates[0];

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
            canonicalName: input.canonicalName,
            collectorNumber: input.collectorNumber ?? null,
            collectorNumberKey: printingKey,
            collectorNumberSort: collectorIdentifierSort(
              input.collectorNumber ?? null,
            ),
            stableIdentityKey,
            printingVariantKey: variantKey,
            languageCode,
            catalogProvider: input.catalogProvider,
            catalogExternalId: input.catalogCardId,
            cardBackDesign: input.cardBackDesign,
            printingFinish: input.printingFinish,
            physicalForm: input.physicalForm,
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
          .returning({
            id: cardPrintings.id,
            setId: cardPrintings.setId,
            stableIdentityKey: cardPrintings.stableIdentityKey,
            catalogProvider: cardPrintings.catalogProvider,
            catalogExternalId: cardPrintings.catalogExternalId,
            cardBackDesign: cardPrintings.cardBackDesign,
          })
          .get();
        createdPrinting = true;
      } else {
        if (input.catalogProvider && input.catalogCardId) {
          if (
            printing.catalogProvider !== null &&
            (printing.catalogProvider !== input.catalogProvider ||
              printing.catalogExternalId !== input.catalogCardId)
          ) {
            throw new CardPrintingCatalogConflictError(
              input.name,
              `${printing.catalogProvider}/${printing.catalogExternalId}`,
              `${input.catalogProvider}/${input.catalogCardId}`,
            );
          }
          tx.update(cardPrintings)
            .set({
              catalogProvider: input.catalogProvider,
              catalogExternalId: input.catalogCardId,
              stableIdentityKey:
                printing.catalogProvider === null
                  ? stableIdentityKey
                  : printing.stableIdentityKey,
              cardBackDesign:
                printing.cardBackDesign ?? input.cardBackDesign ?? null,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(cardPrintings.id, printing.id))
            .run();
        } else if (
          printing.cardBackDesign === null &&
          input.cardBackDesign != null
        ) {
          tx.update(cardPrintings)
            .set({
              cardBackDesign: input.cardBackDesign,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(cardPrintings.id, printing.id))
            .run();
        }
      }

      if (input.printedIdentifiers?.length) {
        tx.insert(printingIdentifiers)
          .values(
            input.printedIdentifiers.map((identifier) => ({
              printingId: printing.id,
              role: identifier.role,
              value: identifier.value,
              label: identifier.label,
            })),
          )
          .onConflictDoNothing()
          .run();
      }

      if (componentGroup && input.componentGroup) {
        const occupiedComponent = tx
          .select({ printingId: printingGroupMembers.printingId })
          .from(printingGroupMembers)
          .where(
            and(
              eq(printingGroupMembers.groupId, componentGroup.id),
              eq(
                printingGroupMembers.componentKey,
                input.componentGroup.componentKey,
              ),
            ),
          )
          .get();
        if (occupiedComponent && occupiedComponent.printingId !== printing.id) {
          throw new PrintingGroupConflictError(
            `Component ${input.componentGroup.componentKey} is already assigned in group ${componentGroup.groupKey}.`,
          );
        }
        tx.insert(printingGroupMembers)
          .values({
            groupId: componentGroup.id,
            printingId: printing.id,
            componentKey: input.componentGroup.componentKey,
          })
          .onConflictDoNothing()
          .run();
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
          profileId,
          printingId: printing.id,
          quantity: input.quantity,
          condition: input.condition,
          finishVariant: input.finishVariant,
          sealed: input.sealed ?? false,
          notes: input.notes,
          metadata: {
            ...(input.deckPool ? { deckPool: input.deckPool } : {}),
            ...(input.photoBatch ? { photoBatch: input.photoBatch } : {}),
            ...(input.gridPosition ? { gridPosition: input.gridPosition } : {}),
            ...(input.frontPhoto ? { frontPhoto: input.frontPhoto } : {}),
            ...(input.backPhoto ? { backPhoto: input.backPhoto } : {}),
          },
        })
        .returning({ id: ownedCards.id })
        .get().id;
    });

    const detail = this.getDetail(profileId, ownedCardId);
    if (!detail) {
      throw new Error(
        `Created collection entry ${ownedCardId} could not be read back.`,
      );
    }

    return detail;
  }
}
