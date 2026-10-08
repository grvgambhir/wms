/** Gradient stop tokens — World Masters Sport blues (REV-021). Used with expo-linear-gradient. */
export const gradients = {
  screen: ['#E3EDF5', '#F5F8FB', '#EEF4FA'] as const,
  screenAccent: ['#F5F8FB', '#E8F2FA', '#F5F8FB'] as const,
  primary: ['#0C71C3', '#4887CA', '#5A9BD4'] as const,
  hero: ['#0A4F8C', '#0C71C3', '#4887CA'] as const,
  cta: ['#0C71C3', '#4887CA', '#008FD5'] as const,
  sportIcon: ['#0C71C3', '#4887CA'] as const,
  orbPrimary: 'rgba(72, 135, 202, 0.18)',
  orbAccent: 'rgba(0, 143, 213, 0.14)',
} as const;

export type GradientToken = keyof typeof gradients;
