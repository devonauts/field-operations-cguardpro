import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";

/**
 * Theme system — the single runtime switch for the whole app.
 *
 * The app ships two themes driven entirely by CSS tokens (see
 * theme/variables.css): DARK (matte black, dark-gray components — the default)
 * and LIGHT (white background, crisp white components). Switching is a single
 * class toggle on <html>: `theme-light` present → LIGHT, absent → DARK. Every
 * `bg-*`/`text-*`/`border-*` utility resolves to a runtime var, so the entire
 * UI re-skins instantly with no per-component logic.
 *
 * Persistence: localStorage key `wa.theme` ('dark' | 'light'), default 'dark'.
 * main.tsx applies the persisted class to <html> BEFORE React renders to avoid
 * a flash; this provider keeps React state and the DOM class in sync after.
 */

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "wa.theme";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Read the persisted theme, defaulting to DARK. Safe to call pre-render. */
export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

/** Toggle the `theme-light` class on <html> to match the given theme. */
export function applyThemeClass(theme: Theme): void {
  const el = document.documentElement;
  el.classList.toggle("theme-light", theme === "light");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  // Keep the DOM class + storage in sync whenever the theme changes.
  useEffect(() => {
    applyThemeClass(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable — class is still applied for this session */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    [],
  );

  const value = useMemo(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
