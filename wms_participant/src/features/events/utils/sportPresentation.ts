import { colors } from '@/theme/colors';

export type SportCategoryFilter = 'all' | 'racket' | 'team' | 'water' | 'other';

type SportVisualMeta = {
  color: string;
  category: SportCategoryFilter;
  subtitle: string;
};

const DEFAULT_META: SportVisualMeta = {
  color: colors.textMuted,
  category: 'other',
  subtitle: 'Open categories',
};

/** POC sport presentation map for A05 list rows — keyed by fixture iconKey. */
const SPORT_META: Record<string, SportVisualMeta> = {
  tennis: { color: '#10B981', category: 'racket', subtitle: 'Singles, Doubles' },
  badminton: { color: '#14B8A6', category: 'racket', subtitle: 'Singles, Doubles' },
  tableTennis: { color: '#14B8A6', category: 'racket', subtitle: 'Singles, Doubles' },
  pickleball: { color: '#10B981', category: 'racket', subtitle: 'Singles, Doubles' },
  swimming: { color: '#3B82F6', category: 'water', subtitle: 'Open' },
  rowing: { color: '#1D4ED8', category: 'water', subtitle: 'Crew, Sculls' },
  cycling: { color: '#EAB308', category: 'other', subtitle: 'Road, Time Trial' },
  athletics: { color: '#F97316', category: 'other', subtitle: 'Track & Field' },
  basketball: { color: '#EC4899', category: 'team', subtitle: '5-a-side' },
  volleyball: { color: '#8B5CF6', category: 'team', subtitle: 'Indoor, Beach' },
  golf: { color: '#22C55E', category: 'other', subtitle: 'Stroke play' },
  bowling: { color: '#6366F1', category: 'other', subtitle: 'Singles, Doubles' },
  shooting: { color: '#78716C', category: 'other', subtitle: 'Trap, Skeet' },
  roadRace: { color: '#0EA5E9', category: 'other', subtitle: '1 mile, 5K, 10K' },
  powerWalk: { color: '#06B6D4', category: 'other', subtitle: 'Open' },
  discGolf: { color: '#84CC16', category: 'other', subtitle: 'Open' },
  horseshoes: { color: '#A16207', category: 'other', subtitle: 'Open' },
  shuffleboard: { color: '#A855F7', category: 'other', subtitle: 'Open' },
};

export function getSportVisualMeta(iconKey?: string, sportName?: string): SportVisualMeta {
  if (iconKey && SPORT_META[iconKey]) {
    return SPORT_META[iconKey];
  }

  const normalized = sportName?.toLowerCase() ?? '';
  if (normalized.includes('tennis')) return SPORT_META.tennis;
  if (normalized.includes('swim')) return SPORT_META.swimming;

  return DEFAULT_META;
}

export function matchesSportCategory(iconKey: string | undefined, sportName: string, filter: SportCategoryFilter): boolean {
  if (filter === 'all') return true;
  return getSportVisualMeta(iconKey, sportName).category === filter;
}
