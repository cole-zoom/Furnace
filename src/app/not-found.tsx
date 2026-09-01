import Link from "next/link";
import { FurnaceMark } from "@/components/furnace-mark";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5">
      <div className="w-full max-w-[380px] text-center">
        <div className="mb-6 flex justify-center">
          <FurnaceMark size={56} lit={false} />
        </div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-fg">
          Nothing burning here
        </h1>
        <p className="mt-2 text-[13px] leading-[1.55] text-fg-muted">
          That page doesn&apos;t exist, or it isn&apos;t yours.
        </p>
        <Link
          href="/tasks"
          className="mt-6 inline-flex h-8 items-center rounded-md bg-blue-500 px-3 text-sm font-medium
                     text-white transition-colors duration-[50ms] hover:bg-blue-450"
        >
          Back to tasks
        </Link>
      </div>
    </div>
  );
}
