/** World Masters Sport semantic tokens — matched to `worlmasters.html` (REV-021). */
export const colors = {
  background: '#F5F8FB',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF3F8',
  primary: '#4887CA',
  primaryDark: '#0C71C3',
  primaryForeground: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#666666',
  border: '#E3EDF5',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  info: '#0C71C3',
  gradientPrimaryStart: '#0C71C3',
  gradientPrimaryEnd: '#4887CA',
  gradientHeroStart: '#0A4F8C',
  gradientHeroEnd: '#008FD5',
} as const;

export type ColorToken = keyof typeof colors;
