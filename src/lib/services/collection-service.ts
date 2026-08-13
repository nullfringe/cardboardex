import { z } from "zod";

import { getDatabase, type AppDatabase } from "@/db/client";
import { applyCardImagePolicy } from "@/lib/images/card-image-provider";
import { CollectionRepository } from "@/lib/repositories/collection-repository";
import { ProfileRepository } from "@/lib/repositories/profile-repository";
import { isTrustedCardImageUrl } from "@/lib/security/card-image-policy";
import {
  ProfileNotFoundError,
  profileSlugSchema,
} from "@/lib/services/profile-service";
import type {
  CollectionDetail,
  CollectionFacets,
  CollectionListItem,
  CollectionListQuery,
  CreateCollectionEntryInput,
  UpdateOwnedCardInput,
} from "@/lib/types/collection";

const requiredText = (label: string, maximum = 200) =>
  z
    .string({ error: `${label} must be text.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(maximum, `${label} is too long.`)
    .transform((value) => value.normalize("NFC"));

const nullableText = (label: string, maximum = 10_000) =>
  z
    .union([z.string({ error: `${label} must be text or null.` }), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return value;
      const trimmed = value.trim().normalize("NFC");
      return trimmed.length > 0 ? trimmed : null;
    })
    .refine(
      (value) =>
        value === undefined || value === null || value.length <= maximum,
      {
        message: `${label} is too long.`,
      },
    );

const optionalFilterText = (maximum = 200) =>
  z
    .string()
    .max(maximum)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    });

const nullableUrl = (label: string) =>
  nullableText(label, 2_048).refine(
    (value) => {
      if (value === undefined || value === null) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: `${label} must be an HTTP(S) URL.` },
  );

const trustedImageUrl = nullableUrl("Image URL").refine(
  (value) =>
    value === undefined || value === null || isTrustedCardImageUrl(value),
  {
    message:
      "Image URL must use HTTPS from a trusted card-image origin configured by the application owner.",
  },
);

function slugify(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const collectionListQuerySchema = z
  .object({
    search: optionalFilterText(500),
    gameSlug: optionalFilterText(),
    languageCode: optionalFilterText(20),
    cardKind: optionalFilterText(),
    pokemonType: optionalFilterText(),
    setCode: optionalFilterText(),
    subtype: optionalFilterText(),
    rarity: optionalFilterText(),
    printingFinish: optionalFilterText(500),
    cardBackDesign: optionalFilterText(500),
    physicalForm: optionalFilterText(500),
    finishVariant: optionalFilterText(500),
    sealed: z.boolean().optional(),
    sort: z
      .object({
        field: z.enum([
          "name",
          "set",
          "collectorNumber",
          "pokemonType",
          "hp",
          "quantity",
        ]),
        direction: z.enum(["asc", "desc"]),
      })
      .strict()
      .optional(),
  })
  .strict();

export const updateOwnedCardSchema = z
  .object({
    quantity: z.number().int().positive().max(1_000_000).optional(),
    condition: nullableText("Condition", 200),
    finishVariant: nullableText("Finish / variant", 500),
    sealed: z.boolean().optional(),
    notes: nullableText("Notes"),
  })
  .strict()
  .refine(
    (value) =>
      value.quantity !== undefined ||
      value.condition !== undefined ||
      value.finishVariant !== undefined ||
      value.sealed !== undefined ||
      value.notes !== undefined,
    { message: "At least one owned-card field must be provided." },
  );

const attackInputSchema = z
  .object({
    name: requiredText("Attack name", 300),
    cost: z.array(requiredText("Attack cost symbol", 20)).max(20).optional(),
    damage: nullableText("Attack damage", 100),
    effect: nullableText("Attack effect", 10_000),
  })
  .strict();

const printedIdentifierInputSchema = z
  .object({
    role: requiredText("Printed identifier role", 100)
      .transform((value) => value.toLocaleLowerCase("en-US"))
      .pipe(
        z
          .string()
          .regex(
            /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/u,
            "Printed identifier role is invalid.",
          ),
      ),
    value: requiredText("Printed identifier value", 300),
    label: nullableText("Printed identifier label", 200),
  })
  .strict();

const printingGroupInputSchema = z
  .object({
    groupKey: requiredText("Component group key", 200)
      .transform(slugify)
      .pipe(z.string().min(1, "Component group key is invalid.")),
    groupType: requiredText("Component group type", 200)
      .transform(slugify)
      .pipe(z.string().min(1, "Component group type is invalid.")),
    name: nullableText("Component group name", 300),
    expectedComponentCount: z
      .number()
      .int()
      .positive()
      .max(100)
      .nullable()
      .optional(),
    componentKey: requiredText("Component key", 100)
      .transform(slugify)
      .pipe(z.string().min(1, "Component key is invalid.")),
  })
  .strict();

export const createCollectionEntrySchema = z
  .object({
    gameSlug: requiredText("Game slug", 100)
      .transform(slugify)
      .pipe(z.string().min(1, "Game slug must contain letters or numbers.")),
    gameName: requiredText("Game name", 200),
    setCode: requiredText("Set code", 100),
    setName: requiredText("Set name", 300),
    name: requiredText("Card name", 300),
    canonicalName: nullableText("English / canonical name", 300),
    collectorNumber: nullableText("Collector identifier", 100),
    languageCode: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{2}(?:-[a-z]{2})?$/u, "Language code is invalid.")
      .default("en"),
    catalogProvider: nullableText("Catalog provider", 100),
    catalogSetId: nullableText("Catalog set ID", 300),
    catalogCardId: nullableText("Catalog card ID", 500),
    cardBackDesign: nullableText("Card-back design", 300),
    printingFinish: nullableText("Published printing finish", 300),
    physicalForm: nullableText("Physical form", 300),
    printedIdentifiers: z
      .array(printedIdentifierInputSchema)
      .max(50)
      .optional(),
    componentGroup: printingGroupInputSchema.nullable().optional(),
    printingVariantKey: requiredText("Printing variant key", 200)
      .transform(slugify)
      .pipe(
        z
          .string()
          .min(1, "Printing variant key must contain letters or numbers."),
      )
      .optional(),
    cardKind: requiredText("Card kind", 100),
    subtype: nullableText("Subtype", 200),
    rarity: nullableText("Rarity", 200),
    regulationMark: nullableText("Regulation mark", 50),
    specialRuleBox: nullableText("Special / rule box", 2_000),
    abilityRule: nullableText("Ability / rule", 10_000),
    rulesText: nullableText("Rules text", 20_000),
    identificationConfidence: nullableText("Identification confidence", 100),
    visibleMoveOrEffect1: nullableText("Visible move / effect 1", 2_000),
    visibleMoveOrEffect2: nullableText("Visible move / effect 2", 2_000),
    pokemonType: nullableText("Pokémon type", 100),
    hp: z.number().int().nonnegative().max(100_000).nullable().optional(),
    evolvesFrom: nullableText("Evolves from", 300),
    weakness: nullableText("Weakness", 300),
    resistance: nullableText("Resistance", 300),
    retreatCost: z.number().int().nonnegative().max(100).nullable().optional(),
    attacks: z.array(attackInputSchema).max(20).optional(),
    quantity: z.number().int().positive().max(1_000_000),
    condition: nullableText("Condition", 200),
    finishVariant: nullableText("Finish / variant", 500),
    sealed: z.boolean().optional(),
    notes: nullableText("Notes"),
    deckPool: nullableText("Deck pool", 500),
    photoBatch: nullableText("Photo batch", 500),
    gridPosition: nullableText("Grid position", 200),
    frontPhoto: nullableText("Front photo", 1_000),
    backPhoto: nullableText("Back photo", 1_000),
    imageProvider: nullableText("Image provider", 200),
    imageExternalId: nullableText("Image external ID", 500),
    imageUrl: trustedImageUrl,
    externalReferenceUrl: nullableUrl("External reference URL"),
  })
  .strict()
  .superRefine((value, context) => {
    const catalogParts = [
      value.catalogProvider,
      value.catalogSetId,
      value.catalogCardId,
    ];
    if (
      catalogParts.some((part) => part !== undefined && part !== null) &&
      catalogParts.some((part) => part === undefined || part === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["catalogProvider"],
        message:
          "Catalog provider, set ID, and card ID must all be supplied together.",
      });
    }
  });

function positiveId(id: number): number {
  return z.number().int().positive().parse(id);
}

export class CollectionService {
  constructor(
    private readonly repository: CollectionRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  private profileId(profileSlug: string): number {
    const profile = this.profiles.getBySlug(
      profileSlugSchema.parse(profileSlug),
    );
    if (!profile) throw new ProfileNotFoundError();
    return profile.id;
  }

  listCollection(
    profileSlug: string,
    query: CollectionListQuery = {},
  ): CollectionListItem[] {
    const parsed = collectionListQuerySchema.parse(
      query,
    ) as CollectionListQuery;
    return this.repository
      .list(this.profileId(profileSlug), parsed)
      .map(applyCardImagePolicy);
  }

  getCollectionEntry(
    profileSlug: string,
    ownedCardId: number,
  ): CollectionDetail | null {
    const detail = this.repository.getDetail(
      this.profileId(profileSlug),
      positiveId(ownedCardId),
    );
    return detail ? applyCardImagePolicy(detail) : null;
  }

  getCollectionFacets(profileSlug: string): CollectionFacets {
    return this.repository.getFacets(this.profileId(profileSlug));
  }

  updateOwnedCard(
    profileSlug: string,
    ownedCardId: number,
    input: UpdateOwnedCardInput,
  ): CollectionDetail | null {
    const parsed = updateOwnedCardSchema.parse(input) as UpdateOwnedCardInput;
    const detail = this.repository.updateOwnedCard(
      this.profileId(profileSlug),
      positiveId(ownedCardId),
      parsed,
    );
    return detail ? applyCardImagePolicy(detail) : null;
  }

  deleteCollectionEntry(profileSlug: string, ownedCardId: number): boolean {
    return this.repository.deleteOwnedCard(
      this.profileId(profileSlug),
      positiveId(ownedCardId),
    );
  }

  createCollectionEntry(
    profileSlug: string,
    input: CreateCollectionEntryInput,
  ): CollectionDetail {
    const parsed = createCollectionEntrySchema.parse(
      input,
    ) as CreateCollectionEntryInput;
    return applyCardImagePolicy(
      this.repository.create(this.profileId(profileSlug), parsed),
    );
  }
}

export function createCollectionService(db: AppDatabase): CollectionService {
  return new CollectionService(
    new CollectionRepository(db),
    new ProfileRepository(db),
  );
}

export function getCollectionService(): CollectionService {
  return createCollectionService(getDatabase());
}
