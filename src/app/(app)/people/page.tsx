import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PeopleView } from "@/components/people-view";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: people } = await supabase
    .from("people")
    .select("*")
    .eq("user_id", user.id)
    .order("last_met_at", { ascending: false, nullsFirst: false });

  return (
    <Suspense fallback={null}>
      <PeopleView people={people ?? []} />
    </Suspense>
  );
}
