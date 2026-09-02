import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { env } from "@/lib/env";

export default async function RootPage() {
  // redirect() throws, so it must stay outside any try/catch — and an
  // unconfigured deploy has to be handled before we touch Supabase at all.
  if (!env.isConfigured) redirect("/login");

  const user = await getUser();
  redirect(user ? "/tasks" : "/login");
}
