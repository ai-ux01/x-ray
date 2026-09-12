"use client";

// Lightweight theme provider.
//
// Replaces next-themes to avoid React 19's dev-only "Encountered a script tag"
// warning, which fires for any <script> rendered in the React tree (next-themes
// always injects one). The layout defaults <html> to the dark class statically
// on the server, and this provider reconciles to the user's stored/system
// choice on mount — no inline script anywhere. Shares the same "theme"
// localStorage key and `dark` class so behavior is unchanged.

import * as React from "react";

export type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "theme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: Resolved;
  systemTheme: Resolved;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function getSystemTheme(): Resolved {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeClass(resolved: Resolved) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

function readStoredTheme(fallback: Theme): Theme {
  if (typeof window === "undefined") return fallback;
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : fallback;
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: React.ReactNode;
  /** Fallback when nothing is stored yet. */
  defaultTheme?: Theme;
}) {
  // Lazy initializers read client-only state once, without a mount-time
  // setState (which the react-hooks rules flag as a cascading render).
  const [theme, setThemeState] = React.useState<Theme>(() =>
    readStoredTheme(defaultTheme),
  );
  const [systemTheme, setSystemTheme] = React.useState<Resolved>(() =>
    getSystemTheme(),
  );

  // Track OS preference changes while "system" is active.
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: Resolved = theme === "system" ? systemTheme : theme;

  // Apply the class whenever the resolved theme changes.
  React.useEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = React.useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors (private mode, etc.)
    }
    setThemeState(next);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, systemTheme, setTheme }),
    [theme, resolvedTheme, systemTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
