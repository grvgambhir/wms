import { colors } from './colors';
import { glass } from './glass';
import { gradients } from './gradients';
import { radius } from './radius';
import { spacing } from './spacing';
import { typography } from './typography';

export const tokens = {
  colors,
  glass,
  gradients,
  spacing,
  radius,
  typography,
} as const;

export { colors, glass, gradients, radius, spacing, typography };
