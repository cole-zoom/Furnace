import { Skeleton } from "@/components/ui/misc";

/** Suspense fallback for the simple list routes (People, and anything like it). */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--stroke)] px-4">
        <Skeleton className="h-4 w-20" />
        <div className="ml-auto">
          <Skeleton className="h-7 w-[190px] rounded-md" />
        </div>
      </header>
      <div className="flex-1">
        {Array.from({ length: rows }).map((_, row) => (
          <div
            key={row}
            className="flex items-center gap-3 border-b border-[var(--stroke-weak)] px-4 py-2.5"
          >
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="ml-auto h-3 w-20" />
          </div>
        ))}
      </div>
    </>
  );
}
