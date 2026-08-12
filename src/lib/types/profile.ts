export type Profile = {
  id: number;
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateProfileInput = {
  name: string;
};

export type UpdateProfileInput = {
  name: string;
};

export type DuplicateProfileInput = {
  name: string;
};

export type DeleteProfileResult = {
  deletedProfile: Profile;
  remainingProfiles: Profile[];
};
