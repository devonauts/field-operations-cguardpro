/**
 * Tenant branding for the app — applies the CRM's "Hub móvil del equipo"
 * customization (Settings › Hub Móvil): accent color, display name/tagline,
 * tenant logo, default theme, and module visibility.
 *
 * Flow:
 *  - main.tsx calls initBrandingCache() BEFORE first paint: re-applies the
 *    last-known config from localStorage so there's no flash of default gold,
 *    and seeds the tenant's default theme on true first launch.
 *  - AuthContext calls refreshBranding() once authenticated: fetches
 *    GET /tenant/:id/mobile-app-config, caches it, applies it live.
 *  - Components read it via useBranding() / isModuleEnabled().
 *
 * Recoloring works because the design system routes EVERYTHING through the
 * --gold* custom properties (+ Ionic's --ion-color-primary set) — see
 * theme/variables.css. We override them inline on <html>, which beats both
 * the :root and html.theme-light blocks, so one override set serves both
 * themes. Factory reset = removing the inline overrides.
 */
import { useSyncExternalStore } from "react";
import { api, getToken, getTenantId, unwrap } from "./api";
import { THEME_STORAGE_KEY } from "../context/ThemeContext";

export interface AppBranding {
  accentColor: string;      // '' = factory gold
  displayName: string;      // '' = C-Guard Pro
  tagline: string;          // '' = default tagline
  useTenantLogo: boolean;
  defaultTheme: "dark" | "light" | "user";
  modules: Record<string, boolean>;
  /** Reglas globales de puestos (server re-enforces; app uses for proactive UX). */
  postRules: { requireActiveShiftForRounds: boolean };
  tenantName: string | null;
  logoUrl: string | null;
}

const CACHE_KEY = "tenant.appBranding";

const DEFAULTS: AppBranding = {
  accentColor: "",
  displayName: "",
  tagline: "",
  useTenantLogo: true,
  defaultTheme: "dark",
  modules: {},
  postRules: { requireActiveShiftForRounds: false },
  tenantName: null,
  logoUrl: null,
};

let current: AppBranding = { ...DEFAULTS };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });

/* ── color math (hex in, shades out) ─────────────────────────────────────── */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const toHex = ([r, g, b]: [number, number, number]) =>
  `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
const shade = (rgb: [number, number, number], f: number): [number, number, number] =>
  f >= 0
    ? [rgb[0] * (1 - f), rgb[1] * (1 - f), rgb[2] * (1 - f)] as [number, number, number]
    : [rgb[0] - rgb[0] * f + (-f * 255 - -f * rgb[0]), rgb[1] + -f * (255 - rgb[1]), rgb[2] + -f * (255 - rgb[2])] as [number, number, number];
/** WCAG relative luminance — decides whether text ON the accent is dark or light. */
function isLightColor(rgb: [number, number, number]): boolean {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}

const ACCENT_VARS = [
  "--gold", "--gold-strong", "--gold-hover", "--gold-soft", "--gold-text",
  "--on-accent", "--focus-ring",
  "--ion-color-primary", "--ion-color-primary-rgb", "--ion-color-primary-contrast",
  "--ion-color-primary-contrast-rgb", "--ion-color-primary-shade",
  "--ion-color-primary-tint", "--ion-tab-bar-color-selected",
];

function applyAccent(hex: string): void {
  const el = document.documentElement;
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) {
    // Factory gold: drop the inline overrides so variables.css resolves again.
    ACCENT_VARS.forEach((v) => el.style.removeProperty(v));
    return;
  }
  const light = isLightColor(rgb);
  const onAccent = light ? "#0b0c0e" : "#ffffff";
  const onAccentRgb = light ? "11, 12, 14" : "255, 255, 255";
  const set = (k: string, v: string) => el.style.setProperty(k, v);
  set("--gold", hex);
  set("--gold-strong", toHex(shade(rgb, 0.1)));
  set("--gold-hover", toHex(shade(rgb, 0.18)));
  set("--gold-soft", `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.12)`);
  set("--gold-text", hex);
  set("--on-accent", onAccent);
  set("--focus-ring", hex);
  set("--ion-color-primary", hex);
  set("--ion-color-primary-rgb", `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`);
  set("--ion-color-primary-contrast", onAccent);
  set("--ion-color-primary-contrast-rgb", onAccentRgb);
  set("--ion-color-primary-shade", toHex(shade(rgb, 0.18)));
  set("--ion-color-primary-tint", toHex(shade(rgb, -0.1)));
  set("--ion-tab-bar-color-selected", hex);
}

/* ── store ───────────────────────────────────────────────────────────────── */

function applyBranding(cfg: AppBranding): void {
  current = {
    ...DEFAULTS,
    ...cfg,
    modules: { ...(cfg.modules || {}) },
    postRules: { ...DEFAULTS.postRules, ...((cfg as any).postRules || {}) },
  };
  applyAccent(current.accentColor);
  emit();
}

/**
 * Pre-paint init: apply the cached config and, on a TRUE first launch (no
 * persisted theme yet), seed the tenant's default theme so main.tsx's
 * applyThemeClass picks it up. Call BEFORE applyThemeClass(getStoredTheme()).
 */
export function initBrandingCache(): void {
  let cached: AppBranding | null = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { /* ignore */ }
  if (!cached) return;
  try {
    if (!localStorage.getItem(THEME_STORAGE_KEY) && cached.defaultTheme && cached.defaultTheme !== "user") {
      localStorage.setItem(THEME_STORAGE_KEY, cached.defaultTheme);
    } else if (!localStorage.getItem(THEME_STORAGE_KEY) && cached.defaultTheme === "user") {
      const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
      localStorage.setItem(THEME_STORAGE_KEY, prefersLight ? "light" : "dark");
    }
  } catch { /* ignore */ }
  applyBranding(cached);
}

/** Fetch the tenant's config and apply+cache it. Call once authenticated. */
export async function refreshBranding(): Promise<void> {
  try {
    if (!getToken()) return;
    const tenantId = getTenantId();
    if (!tenantId) return;
    const cfg = unwrap<AppBranding>(await api.get(`/tenant/${tenantId}/mobile-app-config`));
    if (!cfg || typeof cfg !== "object") return;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
    applyBranding(cfg as AppBranding);
  } catch {
    // Offline/error — cached branding (already applied) stays in effect.
  }
}

export function getBranding(): AppBranding {
  return current;
}

/** Convenience-module visibility (training/performance/visitors/timeOff/backup/map). Default: visible. */
/** Regla global: rondas requieren turno activo (el servidor la re-aplica). */
export function requireShiftForRounds(): boolean {
  return !!current.postRules?.requireActiveShiftForRounds;
}

export function isModuleEnabled(key: string): boolean {
  const v = current.modules?.[key];
  return typeof v === "boolean" ? v : true;
}

/** React hook — re-renders when branding changes (post-login fetch). */
export function useBranding(): AppBranding {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
  );
}
