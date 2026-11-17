import { getAiUsageSummary, normalizeUsageDays } from "@/lib/ai-usage";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // `users.auth_user_id` is the auth provider's string id; usage rows are
    // owned by the app-level numeric profile id.
    const profile = await ensureUserRecord(user);
    const { searchParams } = new URL(request.url);
    const days = normalizeUsageDays(searchParams.get("range"));
    const data = await getAiUsageSummary(profile.id, days);

    return Response.json({ success: true, data });
  } catch (error) {
    console.error("AI usage API error:", error);
    return Response.json({ error: "Could not read AI usage." }, { status: 500 });
  }
}
