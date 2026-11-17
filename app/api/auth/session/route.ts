import { getSessionUser, type AuthProvider } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { saveUser } from "@/lib/users";

const ALLOWED_PROVIDERS: AuthProvider[] = ["email", "google", "github"];

export async function POST(request: Request) {
  let payload: { token?: unknown; provider?: unknown };

  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!token) {
    return Response.json({ message: "Missing session token." }, { status: 400 });
  }

  const user = await getSessionUser(token);
  if (!user) {
    return Response.json({ message: "That session is no longer valid." }, { status: 401 });
  }

  const provider = ALLOWED_PROVIDERS.includes(payload.provider as AuthProvider)
    ? (payload.provider as AuthProvider)
    : "email";

  await saveUser(user, provider);
  await setSessionCookie(token);

  return Response.json({ ok: true });
}
