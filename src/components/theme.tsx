"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { createLocalStore } from "@/lib/local-store";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "furnace-theme";

const themeStore = createLocalStore<Theme>(STORAGE_KEY, "system", (v) =>
  v === "light" || v === "dark" || v === "system",
);

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: "system", setTheme: () => {} });

/**
 * Runs before paint, inlined in <head>, so the first frame is already the right
 * colour. Without this you get a white flash on every hard load in dark mode.
 */
export const THEME_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var dark = stored === 'dark' ||
      ((!stored || stored === 'system') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`.trim();

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.get,
    themeStore.getServer,
  );

  const apply = useCallback((next: Theme) => {
    const dark =
      next === "dark" ||
      (next === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  const setTheme = useCallback(
    (next: Theme) => {
      themeStore.set(next);
      apply(next);
    },
    [apply],
  );

  // Track the OS only while the user hasn't made an explicit choice.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, apply]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const options: Array<{ value: Theme; icon: typeof Sun; label: string }> = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "system", icon: Monitor, label: "System" },
    { value: "dark", icon: Moon, label: "Dark" },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md bg-bg-subtle p-0.5",
        className,
      )}
      role="radiogroup"
      aria-label="Colour theme"
    >
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          onClick={() => setTheme(value)}
          className={cn(
            "grid size-6 place-items-center rounded transition-all duration-[50ms]",
            theme === value
              ? "bg-bg text-fg-body shadow-[0_1px_2px_rgba(0,0,0,.06)]"
              : "text-fg-caption hover:text-fg-muted",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
