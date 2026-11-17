import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser, type AuthUser } from "@/lib/auth";

export const SESSION_COOKIE = "cloudhike_session";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionToken() {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** The signed-in CloudHike user, or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return getSessionUser(token);
}

/** Use in protected server components and actions. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
