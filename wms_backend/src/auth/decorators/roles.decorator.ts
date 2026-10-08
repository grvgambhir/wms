// TEMPORARY AUTH — placeholder until decision D5 selects an identity provider.
// Not production: no MFA (PLT-04 is a mandatory gate item), no password reset,
// passwords stored locally. Replace LocalIdentityProvider, keep the interface.

import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'auth:roles';

export const Roles = (...roles: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
