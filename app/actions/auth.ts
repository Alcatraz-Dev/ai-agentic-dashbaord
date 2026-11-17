"use server";

import { redirect } from "next/navigation";

import { AuthError, revokeSession, signInWithEmail, signUpWithEmail } from "@/lib/auth";
import { clearSessionCookie, getSessionToken, setSessionCookie } from "@/lib/session";
import { saveUser } from "@/lib/users";

export type AuthFormState = { error: string | null; notice: string | null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function readField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = readField(formData, "name");
  const email = readField(formData, "email").toLowerCase();
  const password = readField(formData, "password");

  if (!name) return { error: "Please enter your name.", notice: null };
  if (!EMAIL_PATTERN.test(email)) return { error: "Please enter a valid email address.", notice: null };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      notice: null,
    };
  }

  try {
    const { token, user } = await signUpWithEmail({ name, email, password });
    await saveUser(user, "email");

    // With "Require a verified email" on, CloudHike creates the user and emails a
    // link but issues no session token yet.
    if (!token) {
      return {
        error: null,
        notice: `Account created. Check ${user.email} for a verification link, then sign in.`,
      };
    }

    await setSessionCookie(token);
  } catch (error) {
    if (error instanceof AuthError) return { error: error.message, notice: null };
    console.error("[auth] sign-up failed", error);
    return { error: "Something went wrong while creating your account.", notice: null };
  }

  redirect("/dashboard");
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readField(formData, "email").toLowerCase();
  const password = readField(formData, "password");

  if (!EMAIL_PATTERN.test(email)) return { error: "Please enter a valid email address.", notice: null };
  if (!password) return { error: "Please enter your password.", notice: null };

  try {
    const { token, user } = await signInWithEmail({ email, password });
    await saveUser(user, "email");

    if (!token) {
      return {
        error: null,
        notice: `Check ${user.email} for a verification link before signing in.`,
      };
    }

    await setSessionCookie(token);
  } catch (error) {
    if (error instanceof AuthError) {
      // 403 = correct credentials, but the CloudHike project requires a verified email.
      if (error.status === 403) {
        return {
          error: null,
          notice: "Your email isn't verified yet. Open the link we sent you, then sign in.",
        };
      }
      return { error: error.message, notice: null };
    }
    console.error("[auth] sign-in failed", error);
    return { error: "Something went wrong while signing you in.", notice: null };
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) await revokeSession(token);
  await clearSessionCookie();
  redirect("/sign-in");
}
