/** Shared auth types — safe to import from client components. */

export type AuthProvider = "email" | "google" | "github";

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  avatarUrl?: string | null;
  picture?: string | null;
  emailVerified?: boolean;
};
