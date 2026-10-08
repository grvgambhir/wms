// TEMPORARY AUTH — placeholder until decision D5 selects an identity provider.
// Not production: no MFA (PLT-04 is a mandatory gate item), no password reset,
// passwords stored locally. Replace LocalIdentityProvider, keep the interface.

import { createParamDecorator, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../identity/identity-provider';
import type { AuthenticatedRequest } from '../guards/auth.guard';

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedIdentity => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.identity) {
      throw new UnauthorizedException();
    }
    return request.identity;
  },
);
