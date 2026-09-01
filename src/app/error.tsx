"use client";

import { useEffect } from "react";
import Link from "next/link";
import { FurnaceMark } from "@/components/furnace-mark";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[furnace] unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5">
      <div className="w-full max-w-[400px] text-center">
        <div className="mb-6 flex justify-center">
          <FurnaceMark size={56} lit={false} />
        </div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-fg">
          The fire went out
        </h1>
        <p className="mt-2 text-[13px] leading-[1.55] text-fg-muted">
          Something broke while loading this page.
        </p>
        {/* The digest is the only safe handle on the server-side stack, which
            Next deliberately withholds from the browser in production. */}
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-fg-caption">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" size="sm" onClick={reset}>
            Try again
          </Button>
          <Link
            href="/tasks"
            className="inline-flex h-8 items-center rounded-md bg-bg px-2.5 text-sm font-medium text-fg-body
                       surface-e1 transition-colors duration-[50ms] hover:bg-bg-subtle"
          >
            Back to tasks
          </Link>
        </div>
      </div>
    </div>
  );
}
