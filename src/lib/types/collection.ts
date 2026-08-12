export type CollectionSortField =
  "name" | "set" | "collectorNumber" | "pokemonType" | "hp" | "quantity";

export type SortDirection = "asc" | "desc";

export type CollectionSort = {
  field: CollectionSortField;
  direction: SortDirection;
};

export type CollectionFilters = {
  search?: string;
  gameSlug?: string;
  cardKind?: string;
  pokemonType?: string;
  setCode?: string;
  subtype?: string;
  rarity?: string;
  finishVariant?: string;
  sealed?: boolean;
};

export type CollectionListQuery = CollectionFilters & {
  sort?: CollectionSort;
};

export type CollectionListItem = {
  ownedCardId: number;
  printingId: number;
  profileSlug: string;
  profileName: string;
  gameSlug: string;
  gameName: string;
  name: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  languageCode: string;
  cardKind: string;
  subtype: string | null;
  rarity: string | null;
  regulationMark: string | null;
  pokemonType: string | null;
  hp: number | null;
  quantity: number;
  condition: string | null;
  finishVariant: string | null;
  sealed: boolean;
  imageProvider: string | null;
  imageExternalId: string | null;
  imageUrl: string | null;
};

export type CollectionAttack = {
  id: number;
  position: number;
  name: string;
  cost: string[];
  damage: string | null;
  effect: string | null;
};

export type CollectionDetail = CollectionListItem & {
  printingVariantKey: string;
  specialRuleBox: string | null;
  abilityRule: string | null;
  rulesText: string | null;
  identificationConfidence: string | null;
  visibleMoveOrEffect1: string | null;
  visibleMoveOrEffect2: string | null;
  evolvesFrom: string | null;
  weakness: string | null;
  resistance: string | null;
  retreatCost: number | null;
  attacks: CollectionAttack[];
  notes: string | null;
  deckPool: string | null;
  externalReferenceUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CollectionFacetOption = {
  value: string;
  label: string;
  count: number;
};

export type CollectionFacets = {
  games: CollectionFacetOption[];
  cardKinds: CollectionFacetOption[];
  pokemonTypes: CollectionFacetOption[];
  sets: CollectionFacetOption[];
  subtypes: CollectionFacetOption[];
  finishVariants: CollectionFacetOption[];
  rarities: CollectionFacetOption[];
};

export type UpdateOwnedCardInput = {
  quantity?: number;
  condition?: string | null;
  finishVariant?: string | null;
  sealed?: boolean;
  notes?: string | null;
};

export type CreateAttackInput = {
  name: string;
  cost?: string[];
  damage?: string | null;
  effect?: string | null;
};

export type CreateCollectionEntryInput = {
  gameSlug: string;
  gameName: string;
  setCode: string;
  setName: string;
  name: string;
  collectorNumber: string;
  printingVariantKey?: string;
  languageCode?: string;
  cardKind: string;
  subtype?: string | null;
  rarity?: string | null;
  regulationMark?: string | null;
  specialRuleBox?: string | null;
  abilityRule?: string | null;
  rulesText?: string | null;
  identificationConfidence?: string | null;
  visibleMoveOrEffect1?: string | null;
  visibleMoveOrEffect2?: string | null;
  pokemonType?: string | null;
  hp?: number | null;
  evolvesFrom?: string | null;
  weakness?: string | null;
  resistance?: string | null;
  retreatCost?: number | null;
  attacks?: CreateAttackInput[];
  quantity: number;
  condition?: string | null;
  finishVariant?: string | null;
  sealed?: boolean;
  notes?: string | null;
  deckPool?: string | null;
  imageProvider?: string | null;
  imageExternalId?: string | null;
  imageUrl?: string | null;
  externalReferenceUrl?: string | null;
};
