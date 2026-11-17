// Design tokens. Dark-first, with a light theme. Plain key = background, `on` key = content on it.
import { useMemo, useSyncExternalStore } from "react";
import { Appearance, StyleSheet, useColorScheme, type ViewStyle, type TextStyle, type ImageStyle } from "react-native";

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#05070B",
  onSurface: "#F2F5F9",
  surfaceSecondary: "#0D1117",
  onSurfaceSecondary: "#D6DCE4",
  surfaceTertiary: "#151A22",
  onSurfaceTertiary: "#8B95A4",
  surfaceInverse: "#F2F5F9",
  onSurfaceInverse: "#05070B",
  muted: "#6A7482",

  brand: "#2F7BFF",
  onBrand: "#FFFFFF",
  brandPrimary: "#3D8BFF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#12223B",
  onBrandSecondary: "#9CC4FF",
  brandTertiary: "#0E1828",
  onBrandTertiary: "#7FB5FF",
  accent: "#5CE1FF",
  glow: "#1747A6",

  success: "#34D399",
  onSuccess: "#04140D",
  warning: "#F5A524",
  onWarning: "#1A1003",
  error: "#F87171",
  onError: "#1A0505",
  info: "#5CE1FF",
  onInfo: "#03141A",

  border: "#1A2029",
  borderStrong: "#2A3442",
  divider: "#141922",
};

export type ThemeColors = typeof dark;

const light: ThemeColors = {
  surface: "#F5F6F8",
  onSurface: "#0B0F16",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1F2733",
  surfaceTertiary: "#EAEDF1",
  onSurfaceTertiary: "#5B6573",
  surfaceInverse: "#0B0F16",
  onSurfaceInverse: "#FFFFFF",
  muted: "#7A8493",

  brand: "#1F6BFF",
  onBrand: "#FFFFFF",
  brandPrimary: "#1F6BFF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#E2ECFF",
  onBrandSecondary: "#1550C7",
  brandTertiary: "#EEF4FF",
  onBrandTertiary: "#1F6BFF",
  accent: "#0AA5C9",
  glow: "#9CC0FF",

  success: "#15803D",
  onSuccess: "#FFFFFF",
  warning: "#B45309",
  onWarning: "#FFFFFF",
  error: "#B91C1C",
  onError: "#FFFFFF",
  info: "#0E7490",
  onInfo: "#FFFFFF",

  border: "#E1E5EA",
  borderStrong: "#C9D0D9",
  divider: "#E8EBEF",
};

export const defaultScheme = "dark" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

// In-app override store (works on web too, where Appearance.setColorScheme is a no-op).
let override: ColorScheme | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setColorScheme(scheme: ColorScheme | null) {
  override = scheme;
  Appearance.setColorScheme?.(scheme ?? "unspecified");
  listeners.forEach((l) => l());
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const forced = useSyncExternalStore(subscribe, () => override, () => override);
  const scheme: ColorScheme = forced ?? (system === "light" || system === "dark" ? system : defaultScheme);
  return { scheme, colors: themes[scheme] };
}

export function makeStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)) as T, [colors]);
  };
}