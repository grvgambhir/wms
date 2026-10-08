// TEMPORARY AUTH — placeholder until decision D5 selects an identity provider.
// Not production: no MFA (PLT-04 is a mandatory gate item), no password reset,
// passwords stored locally. Replace LocalIdentityProvider, keep the interface.

import { argon2id, type HashOptions } from 'argon2';

/** OWASP 2024 minimum for argon2id: 19 MiB, time 2, parallelism 1. Not library defaults. */
export const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};
