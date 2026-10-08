import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

import { colors } from '@/theme/colors';

/** RNR-compatible theme object — keep in sync with global.css CSS variables. */
export const THEME = {
  light: {
    background: colors.background,
    foreground: colors.text,
    card: colors.surface,
    cardForeground: colors.text,
    popover: colors.surface,
    popoverForeground: colors.text,
    primary: colors.primary,
    primaryForeground: colors.primaryForeground,
    secondary: colors.surfaceMuted,
    secondaryForeground: colors.text,
    muted: colors.surfaceMuted,
    mutedForeground: colors.textMuted,
    accent: colors.surfaceMuted,
    accentForeground: colors.text,
    destructive: colors.danger,
    border: colors.border,
    input: colors.border,
    ring: colors.primary,
    radius: '0.75rem',
  },
  dark: {
    background: '#0F172A',
    foreground: '#F8FAFC',
    card: '#1E293B',
    cardForeground: '#F8FAFC',
    popover: '#1E293B',
    popoverForeground: '#F8FAFC',
    primary: colors.primary,
    primaryForeground: colors.primaryForeground,
    secondary: '#334155',
    secondaryForeground: '#F8FAFC',
    muted: '#334155',
    mutedForeground: '#94A3B8',
    accent: '#334155',
    accentForeground: '#F8FAFC',
    destructive: colors.danger,
    border: '#334155',
    input: '#334155',
    ring: colors.primary,
    radius: '0.75rem',
  },
} as const;

export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};
