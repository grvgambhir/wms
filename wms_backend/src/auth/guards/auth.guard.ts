// Auth guard. MFA for OC routes is the sibling MfaGuard.

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  IDENTITY_PROVIDER,
  InvalidTokenError,
  type AuthenticatedIdentity,
  type IdentityProvider,
} from '../identity/identity-provider';
import { setRequestActor } from '../../common/logging/logger';

export interface AuthenticatedRequest {
  headers: { authorization?: string; [key: string]: string | string[] | undefined };
  identity?: AuthenticatedIdentity;
  /** Pass this to IdempotencyService.execute as `scope` — never a global key. */
  idempotencyScope?: string;
  /** Raw bearer token — profile completion uses it for Cognito GetUser. */
  accessToken?: string;
  ip?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    const accessToken = header.slice('Bearer '.length).trim();
    if (!accessToken) throw new UnauthorizedException();

    try {
      const identity = await this.identityProvider.verify(accessToken);
      request.identity = identity;
      request.idempotencyScope = identity.personId;
      setRequestActor(identity.personId);
      request.accessToken = accessToken;
      return true;
    } catch (err) {
      if (err instanceof InvalidTokenError) throw new UnauthorizedException();
      throw new UnauthorizedException();
    }
  }
}
