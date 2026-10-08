// English is the base dictionary — it is simply the existing centralized copy.
// Screens that have not yet migrated to `useCopy()` keep importing `copy` directly
// and render English; migrated screens resolve via the current locale.
import { copy } from '@/constants/copy';
import type { CopyDict } from './types';

export const en: CopyDict = copy;
