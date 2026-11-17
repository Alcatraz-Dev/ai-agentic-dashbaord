import { redirect } from "next/navigation";

/** Old Automations URL — keep the bookmark working. */
export default function AutomationsRedirectPage() {
  redirect("/dashboard/jobs");
}
