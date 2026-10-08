/**
 * The one server-side category derivation adapter for a persisted entry/roster.
 *
 * `deriveLoaded` is the rule engine's public, multi-dimension derivation.  Mutation and
 * roster code used to each repeat just its age branch, which meant a new dimension or a
 * rule-engine correction silently made the stored category disagree with previews.  These
 * helpers deliberately only adapt database rows to that engine and project its result back
 * into the legacy scalar entry columns used by fees and start lists.
 */
import { ageOn, type MultiDimensionDerivation } from '@wms/domain';
import type { Queryable } from '../common/idempotency/idempotency.service';
import { deriveLoaded, loadFacts, loadVersion } from './load';

export type CategoryMember = {
  id: string;
  personId: string;
  name: string;
  dob: string;
  role?: string | null;
};

export type DerivedEntryCategory = {
  /** The fee/category key remains the age-band id for the current scalar schema. */
  id?: string;
  name?: string;
  derivation: MultiDimensionDerivation;
  memberAges: Array<{ id: string; name: string; age: number; excluded: boolean }>;
};

export async function deriveEntryCategory(
  db: Queryable,
  args: { ruleVersionId: string; eventId: string; members: CategoryMember[] },
): Promise<DerivedEntryCategory> {
  const loaded = await loadVersion(db, args.ruleVersionId);
  if (!loaded) {
    return {
      derivation: {
        ruleVersionId: args.ruleVersionId,
        referenceDate: '',
        dimensions: [],
        categoryName: '',
        blockedBy: [],
      },
      memberAges: [],
    };
  }
  const facts = await loadFacts(
    db,
    args.eventId,
    args.members.map((member) => member.personId),
  );
  const derivation = deriveLoaded(
    loaded,
    args.members.map((member) => ({
      personId: member.personId,
      dob: member.dob,
      role: member.role ?? undefined,
    })),
    facts,
  );
  const ageDimension = derivation.dimensions.find((dimension) => dimension.attribute === 'age');
  const excludedRoles = new Set(
    (loaded.dimensions.find((dimension) => dimension.attribute === 'age')?.excludeRoles ?? []).map(
      (role) => role.toLowerCase(),
    ),
  );
  return {
    id: ageDimension?.bandId,
    name: derivation.categoryName || undefined,
    derivation,
    memberAges: args.members.map((member) => ({
      id: member.id,
      name: member.name,
      age: ageOn(member.dob, loaded.header.reference_date),
      excluded: member.role ? excludedRoles.has(member.role.toLowerCase()) : false,
    })),
  };
}
