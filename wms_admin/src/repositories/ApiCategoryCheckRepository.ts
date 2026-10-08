import type { MultiDimensionDerivation } from '@wms/domain';

import { backendRequest } from '../auth/backendRequest';

export interface CategoryCheckProduct {
  readonly id: string;
  readonly name: string;
  readonly participantType: string;
  readonly sport: string;
  readonly event: string;
}

export interface CategoryCheckMember {
  readonly dateOfBirth: string;
  readonly role?: string;
}

export interface CategoryCheckResult {
  readonly sportEntryProductId: string;
  readonly sport: string;
  readonly ruleVersionId: string;
  readonly version: string;
  readonly referenceDate: string;
  readonly derivation: MultiDimensionDerivation;
}

export interface CategoryCheckRepository {
  products(): Promise<CategoryCheckProduct[]>;
  check(sportEntryProductId: string, members: readonly CategoryCheckMember[]): Promise<CategoryCheckResult>;
}

/** The active rule, the real derivation, no entry created — see `RulesService.categoryCheck`. */
export const apiCategoryCheckRepository: CategoryCheckRepository = {
  products: () => backendRequest<CategoryCheckProduct[]>('/v1/admin/rules/category-check/products'),
  check: (sportEntryProductId, members) =>
    backendRequest<CategoryCheckResult>('/v1/admin/rules/category-check', {
      method: 'POST',
      body: JSON.stringify({ sportEntryProductId, members }),
    }),
};
