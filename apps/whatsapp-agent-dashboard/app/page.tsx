import { redirect } from "next/navigation";

import { getCurrentDashboardUser } from "../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardEntryPage() {
  const user = await getCurrentDashboardUser();
  redirect(user ? "/inbox" : "/login");
}
