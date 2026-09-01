"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  ChevronsLeft,
  LogOut,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { FurnaceMark } from "@/components/furnace-mark";
import { ThemeToggle } from "@/components/theme";
import { Avatar, Tooltip } from "@/components/ui/misc";
import { Kbd } from "@/components/ui/badge";
import { createLocalStore } from "@/lib/local-store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/people", label: "People", icon: Users },
] as const;

const sidebarStore = createLocalStore<"open" | "collapsed">(
  "furnace-sidebar",
  "open",
  (v) => v === "open" || v === "collapsed",
);

export function Sidebar({
  email,
  name,
  onOpenCommand,
}: {
  email: string;
  name?: string | null;
  onOpenCommand: () => void;
}) {
  const pathname = usePathname();
  const collapsed =
    useSyncExternalStore(
      sidebarStore.subscribe,
      sidebarStore.get,
      sidebarStore.getServer,
    ) === "collapsed";

  const toggle = () => sidebarStore.set(collapsed ? "open" : "collapsed");

  return (
    <aside
      className={cn(
        "group/sidebar relative z-20 flex shrink-0 flex-col border-r border-[var(--stroke)] bg-bg-raised",
        "transition-[width] duration-200 ease-[cubic-bezier(.2,0,0,1)]",
        collapsed ? "w-[56px]" : "w-[224px]",
      )}
    >
      <div className="flex h-12 items-center gap-2 px-3">
        <Link href="/tasks" className="flex min-w-0 items-center gap-2">
          <FurnaceMark size={22} embers={!collapsed} />
          {!collapsed && (
            <span className="truncate text-[14px] font-semibold tracking-[-0.02em] text-fg">
              Furnace
            </span>
          )}
        </Link>

        {!collapsed && (
          <button
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="ml-auto grid size-6 place-items-center rounded text-fg-caption opacity-0
                       transition-all duration-[50ms] hover:bg-bg-subtle hover:text-fg-body
                       group-hover/sidebar:opacity-100 focus-visible:opacity-100"
          >
            <ChevronsLeft className="size-3.5" />
          </button>
        )}
      </div>

      <div className="px-2 pb-2">
        <button
          onClick={collapsed ? toggle : onOpenCommand}
          className={cn(
            "flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] text-fg-caption",
            "surface bg-bg",
            "transition-colors duration-[50ms] hover:bg-bg-subtle hover:text-fg-muted",
            collapsed && "justify-center px-0",
          )}
        >
          <Search className="size-3.5 shrink-0" />
          {!collapsed && (
            <>
              <span>Search</span>
              <span className="ml-auto flex items-center gap-0.5">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </>
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const link = (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex h-7 items-center gap-2 rounded-md px-2 text-[13px] font-medium",
                "transition-colors duration-[50ms] ease-[cubic-bezier(.2,0,0,1)]",
                active
                  ? "bg-bg-inset text-fg"
                  : "text-fg-muted hover:bg-bg-subtle hover:text-fg-body",
                collapsed && "justify-center px-0",
              )}
            >
              {active && (
                <span className="absolute -left-2 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-r bg-[var(--ember)]" />
              )}
              <Icon className="size-3.5 shrink-0" />
              {!collapsed && label}
            </Link>
          );

          return collapsed ? (
            <Tooltip key={href} label={label} side="right" className="w-full">
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-[var(--stroke)] p-2">
        <Link
          href="/settings"
          className={cn(
            "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] font-medium",
            "transition-colors duration-[50ms]",
            pathname === "/settings"
              ? "bg-bg-inset text-fg"
              : "text-fg-muted hover:bg-bg-subtle hover:text-fg-body",
            collapsed && "justify-center px-0",
          )}
        >
          <Settings className="size-3.5 shrink-0" />
          {!collapsed && "Settings"}
        </Link>

        {!collapsed && (
          <div className="flex items-center justify-between pt-1">
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <Tooltip label="Sign out">
                <button
                  type="submit"
                  aria-label="Sign out"
                  className="grid size-6 place-items-center rounded text-fg-caption
                             transition-colors duration-[50ms] hover:bg-bg-subtle hover:text-fg-body"
                >
                  <LogOut className="size-3.5" />
                </button>
              </Tooltip>
            </form>
          </div>
        )}

        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1",
            collapsed && "justify-center px-0",
          )}
        >
          <Avatar name={name} email={email} size={20} />
          {!collapsed && (
            <span className="truncate text-[12px] text-fg-subtle" title={email}>
              {email}
            </span>
          )}
        </div>

        {collapsed && (
          <button
            onClick={toggle}
            aria-label="Expand sidebar"
            className="grid h-6 w-full place-items-center rounded text-fg-caption
                       transition-colors duration-[50ms] hover:bg-bg-subtle hover:text-fg-body"
          >
            <ChevronsLeft className="size-3.5 rotate-180" />
          </button>
        )}
      </div>
    </aside>
  );
}
