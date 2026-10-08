import type { CompetitionCategory } from '@/domain/models/sport';

/** Unique age-group labels for A08 tiles, in fixture order. */
export function uniqueAgeGroups(categories: CompetitionCategory[]): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const category of categories) {
    if (!seen.has(category.ageGroup)) {
      seen.add(category.ageGroup);
      groups.push(category.ageGroup);
    }
  }
  return groups;
}

/** Unique entry types for an age group — used to enable/disable Competitive vs Recreational. */
export function entryTypesForAgeGroup(
  categories: CompetitionCategory[],
  ageGroup: string,
): Array<NonNullable<CompetitionCategory['entryType']>> {
  const types = new Set<NonNullable<CompetitionCategory['entryType']>>();
  for (const category of categories) {
    if (category.ageGroup === ageGroup && category.entryType) {
      types.add(category.entryType);
    }
  }
  return Array.from(types);
}

/** Resolve the category row for the athlete's A08 selections. */
export function findCategoryBySelection(
  categories: CompetitionCategory[],
  ageGroup: string,
  entryType?: CompetitionCategory['entryType'],
): CompetitionCategory | undefined {
  const inAge = categories.filter((category) => category.ageGroup === ageGroup);
  if (!inAge.length) return undefined;
  if (entryType) {
    return inAge.find((category) => category.entryType === entryType) ?? inAge[0];
  }
  return inAge[0];
}

/** Whole years of age on a given ISO date (event start, else today). */
export function ageOnDate(dateOfBirth: string, onDateIso: string): number | null {
  const birth = new Date(dateOfBirth);
  const onDate = new Date(onDateIso);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(onDate.getTime())) return null;

  let age = onDate.getFullYear() - birth.getFullYear();
  const monthDelta = onDate.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && onDate.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}