/** Rough age from ISO date string — sufficient for POC eligibility banner. */
export function calculateAge(dateOfBirth: string, asOf = new Date()): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;

  let age = asOf.getFullYear() - dob.getFullYear();
  const monthDiff = asOf.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dob.getDate())) {
    age -= 1;
  }

  return age;
}

/** Parse age group like "40–44" and check if age falls in range. */
export function isAgeInGroup(age: number | null, ageGroup: string): boolean {
  if (age === null) return false;

  const match = ageGroup.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!match) return true;

  const min = Number(match[1]);
  const max = Number(match[2]);
  return age >= min && age <= max;
}
