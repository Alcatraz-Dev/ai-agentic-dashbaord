/**
 * Server-side client for the CloudHike.dev Auth API.
 *
 * Docs: https://cloudhike.dev/docs/md/auth
 * Every request carries the publishable key in `x-api-key`.
 * The secret key is never used here (it is only for admin endpoints).
 */
import "server-only";

const AUTH_URL = process.env.AUTH_URL;
const PUBLISHABLE_KEY = process.env.AUTH_PUBLISHABLE_KEY;

if (!AUTH_URL || !PUBLISHABLE_KEY) {
  throw new Error(
    "Missing AUTH_URL or AUTH_PUBLISHABLE_KEY. Run the CloudHike setup or add them to .env.",
  );
}

import type { AuthProvider, AuthUser } from "@/lib/auth-types";

export type { AuthProvider, AuthUser } from "@/lib/auth-types";

export type AuthResult = {
  /** Null when the project requires a verified email: the user exists but has no session yet. */
  token: string | null;
  user: AuthUser;
};

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

const baseHeaders = {
  "content-type": "application/json",
  "x-api-key": PUBLISHABLE_KEY,
};

async function readError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function signUpWithEmail(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const response = await fetch(`${AUTH_URL}/sign-up/email`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new AuthError(
      await readError(response, "Could not create your account."),
      response.status,
    );
  }

  return (await response.json()) as AuthResult;
}

export async function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const response = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new AuthError(
      await readError(response, "Invalid email or password."),
      response.status,
    );
  }

  return (await response.json()) as AuthResult;
}

/** Returns the signed-in user for a session token, or null when it is invalid. */
export async function getSessionUser(token: string): Promise<AuthUser | null> {
  const response = await fetch(`${AUTH_URL}/get-session`, {
    headers: { ...baseHeaders, authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const data = (await response.json()) as
    | { user?: AuthUser; session?: { user?: AuthUser } }
    | null;

  if (!data) return null;
  return data.user ?? data.session?.user ?? null;
}

export async function revokeSession(token: string): Promise<void> {
  await fetch(`${AUTH_URL}/sign-out`, {
    method: "POST",
    headers: { ...baseHeaders, authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => undefined);
}

/**
 * URL that starts a GitHub/Google sign-in in the browser.
 * The provider returns to `to` with `#token=...` in the fragment.
 */
export function socialSignInUrl(provider: Exclude<AuthProvider, "email">, to: string) {
  const url = new URL(`${AUTH_URL}/social/${provider}`);
  url.searchParams.set("to", to);
  return url.toString();
}
