import "server-only";

import { eq } from "drizzle-orm";

import { db, users } from "@/db";
import type { AuthProvider, AuthUser } from "@/lib/auth-types";

/** Mirrors the CloudHike user into the app's own `users` table. */
export async function saveUser(user: AuthUser, provider: AuthProvider) {
  const imageUrl = user.image ?? user.avatarUrl ?? user.picture ?? null;

  await db
    .insert(users)
    .values({
      authUserId: user.id,
      email: user.email,
      name: user.name ?? null,
      imageUrl,
      provider,
    })
    .onConflictDoUpdate({
      target: users.authUserId,
      set: {
        email: user.email,
        name: user.name ?? null,
        imageUrl,
        provider,
        updatedAt: new Date(),
      },
    });
}

/**
 * The app-level user row, created on demand if the auth mirror has not run yet
 * (for example a session created outside our sign-in actions). Rows owned by a
 * dashboard must exist for the foreign key, so this never returns null.
 */
export async function ensureUserRecord(user: AuthUser) {
  await db
    .insert(users)
    .values({
      authUserId: user.id,
      email: user.email,
      name: user.name ?? null,
      imageUrl: user.image ?? user.avatarUrl ?? user.picture ?? null,
    })
    .onConflictDoNothing({ target: users.authUserId });

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.authUserId, user.id))
    .limit(1);

  if (!row) throw new Error("Could not resolve the user record for this session.");
  return row;
}
