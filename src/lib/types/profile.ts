import type { MarketCondition } from "@/lib/pricing/conditions";

export type Profile = {
  id: number;
  slug: string;
  name: string;
  defaultPricingCondition: MarketCondition;
  createdAt: string;
  updatedAt: string;
};

export type CreateProfileInput = {
  name: string;
};

export type UpdateProfileInput = {
  name?: string;
  defaultPricingCondition?: MarketCondition;
};

export type DuplicateProfileInput = {
  name: string;
};

export type DeleteProfileResult = {
  deletedProfile: Profile;
  remainingProfiles: Profile[];
};
