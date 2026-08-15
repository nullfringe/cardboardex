import type { MarketCondition } from "@/lib/pricing/conditions";
import type { MarketPriceEstimate } from "@/lib/types/pricing";

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
  languageCode?: string;
  cardKind?: string;
  pokemonType?: string;
  setCode?: string;
  subtype?: string;
  rarity?: string;
  printingFinish?: string;
  cardBackDesign?: string;
  physicalForm?: string;
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
  canonicalName: string | null;
  setName: string;
  setCode: string;
  collectorNumber: string | null;
  languageCode: string;
  cardKind: string;
  subtype: string | null;
  rarity: string | null;
  regulationMark: string | null;
  printingVariantKey: string;
  printingFinish: string | null;
  cardBackDesign: string | null;
  physicalForm: string | null;
  pokemonType: string | null;
  hp: number | null;
  quantity: number;
  condition: string | null;
  pricingConditionOverride: MarketCondition | null;
  finishVariant: string | null;
  sealed: boolean;
  imageProvider: string | null;
  imageExternalId: string | null;
  imageUrl: string | null;
  printedIdentifierText: string | null;
  marketEstimate: MarketPriceEstimate | null;
};

export type CollectionAttack = {
  id: number;
  position: number;
  name: string;
  cost: string[];
  damage: string | null;
  effect: string | null;
};

export type CollectionPrintedIdentifier = {
  id: number;
  role: string;
  value: string;
  label: string | null;
};

export type CollectionPrintingGroup = {
  id: number;
  groupKey: string;
  groupType: string;
  name: string | null;
  expectedComponentCount: number | null;
  componentKey: string;
};

export type CollectionDetail = CollectionListItem & {
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
  printedIdentifiers: CollectionPrintedIdentifier[];
  printingGroups: CollectionPrintingGroup[];
  notes: string | null;
  deckPool: string | null;
  photoBatch: string | null;
  gridPosition: string | null;
  frontPhoto: string | null;
  backPhoto: string | null;
  stableIdentityKey: string;
  catalogProvider: string | null;
  catalogExternalId: string | null;
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
  languages: CollectionFacetOption[];
  printingFinishes: CollectionFacetOption[];
  cardBackDesigns: CollectionFacetOption[];
  physicalForms: CollectionFacetOption[];
};

export type UpdateOwnedCardInput = {
  quantity?: number;
  condition?: string | null;
  pricingConditionOverride?: MarketCondition | null;
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

export type CreatePrintedIdentifierInput = {
  role: string;
  value: string;
  label?: string | null;
};

export type CreatePrintingGroupInput = {
  groupKey: string;
  groupType: string;
  name?: string | null;
  expectedComponentCount?: number | null;
  componentKey: string;
};

export type CreateCollectionEntryInput = {
  gameSlug: string;
  gameName: string;
  setCode: string;
  setName: string;
  name: string;
  canonicalName?: string | null;
  collectorNumber?: string | null;
  printingVariantKey?: string;
  languageCode?: string;
  catalogProvider?: string | null;
  catalogSetId?: string | null;
  catalogCardId?: string | null;
  cardBackDesign?: string | null;
  printingFinish?: string | null;
  physicalForm?: string | null;
  printedIdentifiers?: CreatePrintedIdentifierInput[];
  componentGroup?: CreatePrintingGroupInput | null;
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
  photoBatch?: string | null;
  gridPosition?: string | null;
  frontPhoto?: string | null;
  backPhoto?: string | null;
  imageProvider?: string | null;
  imageExternalId?: string | null;
  imageUrl?: string | null;
  externalReferenceUrl?: string | null;
};
