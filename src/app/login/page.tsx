import { Suspense } from "react";
import type { Metadata } from "next";
import { FurnaceMark } from "@/components/furnace-mark";
import { GoogleSignIn } from "@/components/google-signin";
import { ThemeToggle } from "@/components/theme";
import { SetupRequired } from "@/components/setup-required";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  if (!env.isConfigured) return <SetupRequired />;

  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 items-center justify-between px-5">
        <span className="flex items-center gap-2">
          <FurnaceMark size={22} lit />
          <span className="text-[14px] font-semibold tracking-[-0.02em] text-fg">Furnace</span>
        </span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-20">
        <div className="w-full max-w-[380px]">
          <div className="mb-7 flex justify-center">
            {/* Always lit here — it's the one moment the app is purely inviting. */}
            <FurnaceMark size={80} lit embers className="drop-shadow-[0_8px_24px_rgba(242,105,10,.22)]" />
          </div>

          <h1 className="text-center text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] text-fg">
            Keep the fire going
          </h1>
          <p className="mx-auto mt-2 max-w-[300px] text-center text-[13px] leading-[1.55] text-fg-muted">
            Your tasks, your meetings, and the people behind them — in one place
            that only you can get into.
          </p>

          <div className="mt-7 flex justify-center">
            <Suspense fallback={null}>
              <GoogleSignIn next={safeNext} className="w-full justify-center" />
            </Suspense>
          </div>

          <p className="mt-5 text-center text-[12px] leading-[1.55] text-fg-caption">
            Access is limited to a single allowlisted account. Signing in also
            grants read-only access to your Google Calendar.
          </p>
        </div>
      </main>

      <footer className="pb-6 text-center text-[11px] text-fg-caption">
        Built for one person. Guarded by row-level security.
      </footer>
    </div>
  );
}
