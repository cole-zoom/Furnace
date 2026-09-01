import Link from "next/link";
import type { Metadata } from "next";
import { FurnaceMark } from "@/components/furnace-mark";

export const metadata: Metadata = { title: "Sign-in problem" };

type Props = { searchParams: Promise<{ reason?: string }> };

export default async function AuthErrorPage({ searchParams }: Props) {
  const { reason } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5">
      <div className="w-full max-w-[400px] text-center">
        <div className="mb-6 flex justify-center">
          <FurnaceMark size={64} lit={false} />
        </div>

        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-fg">
          The fire didn&apos;t catch
        </h1>
        <p className="mx-auto mt-2 max-w-[320px] text-[13px] leading-[1.55] text-fg-muted">
          {reason || "Something went wrong while signing you in."}
        </p>

        <div className="mt-6 flex justify-center">
          <Link
            href="/login"
            className="inline-flex h-8 items-center rounded-md bg-blue-500 px-3 text-sm font-medium text-white
                       shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]
                       transition-colors duration-[50ms] hover:bg-blue-450"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
