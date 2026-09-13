import { Skeleton } from "@/components/ui/misc";

/**
 * Suspense fallback for the tasks route.
 *
 * `fallback={null}` renders literally nothing, so any refresh that re-suspends
 * — including the one after saving a task — flashes a blank white page. A
 * skeleton with the same silhouette keeps the layout stable instead.
 */
export function TasksSkeleton() {
  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--stroke)] px-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-12" />
        <div className="ml-auto flex items-center gap-1.5">
          <Skeleton className="h-7 w-[190px] rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-14 rounded-md" />
        </div>
      </header>

      <div className="flex h-full gap-3 overflow-hidden px-4 py-3">
        {[3, 2, 1, 2].map((cards, column) => (
          <div key={column} className="flex min-w-[260px] flex-1 flex-col">
            <div className="mb-2 flex h-7 items-center gap-2 px-0.5">
              <Skeleton className="size-1.5 rounded-full" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <div className="flex flex-1 flex-col gap-1.5 rounded-lg bg-bg-raised/60 p-1.5">
              {Array.from({ length: cards }).map((_, card) => (
                <Skeleton key={card} className="h-[72px] rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Same idea for the simple list routes. */
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
