/// <reference types="jest" />
import { copy } from '@/constants/copy';
import { en } from '@/i18n/en';
import { it as itCopy } from '@/i18n/it';
import type { CopyDict } from '@/i18n';
import { eligibilityMessage } from './eligibilityMessage';

const itDict = { ...en, ...itCopy } as CopyDict;

const KEYS = [
  'eligibility.min_age',
  'eligibility.max_age',
  'eligibility.federation_member',
  'eligibility.licence_valid',
  'eligibility.class_not_expired',
  'eligibility.grade_in',
  'eligibility.attribute_in',
  'eligibility.not_in_list',
  'eligibility.cannot_evaluate',
  'eligibility.no_matching_category',
  'eligibility.judo.weight',
  'eligibility.judo.minimum_belt',
  'eligibility.judo.federation_licence',
] as const;

describe('eligibilityMessage (PLT-02)', () => {
  it('renders a localized sentence from an i18n key, never from the key itself', () => {
    for (const key of KEYS) {
      expect(key.includes(' ')).toBe(false);
      expect(eligibilityMessage(en, key)).toBe(copy[key]);
      expect(eligibilityMessage(itDict, key)).toBe(itDict[key]);
      expect(eligibilityMessage(en, key)).not.toBe(key);
      expect(eligibilityMessage(en, key)).not.toBe(eligibilityMessage(itDict, key));
    }
  });
});
