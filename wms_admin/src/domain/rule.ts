import type {
  CategoryImpact,
  RosterMember,
  RuleChangeNotice,
  SportRule,
} from '@wms/domain';

export type {
  CategoryBand,
  CategoryDerivation,
  CategoryImpact,
  IsoDate,
  MemberAge,
  PublishRuleChangeInput,
  RosterMember,
  RoundingPolicy,
  RuleChangeNotice,
  SportRule,
  TeamCalcStrategy,
} from '@wms/domain';

/** Screen-shaped admin response models composed from shared rule primitives. */
export type RuleImpactRegistration = {
  id: string;
  team: string;
  roster: RosterMember[];
};

export type RuleImpactRow = {
  registration: RuleImpactRegistration;
  impact: CategoryImpact;
};

export type RulesOverview = {
  rule: SportRule;
  ruleSetId: string;
  versionId: string;
  registrations: RuleImpactRegistration[];
  latestNotice: RuleChangeNotice | null;
};

export type PublishRuleChangeResponse = {
  rule: SportRule;
  notice: RuleChangeNotice;
};

export type AdminPublishRuleChangeInput = {
  sport: string;
  event?: string;
  fromVersion: string;
  toVersion: string;
  fromStrategy: SportRule['strategy'];
  toStrategy: SportRule['strategy'];
  affectedCount: number;
  totalCount: number;
  bands: SportRule['bands'];
  ruleSetId: string;
  fromVersionId: string;
};
