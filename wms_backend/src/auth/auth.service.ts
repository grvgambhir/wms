// Login/refresh. MFA for OC routes is MfaGuard.

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { pool } from '../db/pool';
import {
  IDENTITY_PROVIDER,
  InvalidTokenError,
  type AuthenticatedIdentity,
  type IdentityProvider,
  type TokenPair,
} from './identity/identity-provider';
import { LoginRateLimiter } from './login-rate-limiter';

export interface MeResponse {
  id: string;
  email: string | null;
  givenName: string;
  familyName: string;
  roles: string[];
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
    @Inject(LoginRateLimiter) private readonly loginRateLimiter: LoginRateLimiter,
  ) {}

  async login(email: string, password: string, ip: string): Promise<TokenPair> {
    if (!this.loginRateLimiter.allow(email, ip)) {
      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const identity = await this.identityProvider.authenticate(email, password);
    if (!identity) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.identityProvider.issue(identity);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    try {
      return await this.identityProvider.refresh(refreshToken);
    } catch (err) {
      if (err instanceof InvalidTokenError) throw new UnauthorizedException();
      throw new UnauthorizedException();
    }
  }

  async logout(refreshToken: string): Promise<void> {
    await this.identityProvider.revoke(refreshToken);
  }

  async me(identity: AuthenticatedIdentity): Promise<MeResponse> {
    const { rows } = await pool.query<{
      id: string;
      email: string | null;
      given_name: string;
      family_name: string;
    }>(
      `SELECT id, email::text AS email, given_name, family_name
         FROM core.person
        WHERE id = $1`,
      [identity.personId],
    );
    const person = rows[0];
    if (!person) throw new UnauthorizedException();
    return {
      id: person.id,
      email: person.email,
      givenName: person.given_name,
      familyName: person.family_name,
      roles: identity.roles,
    };
  }
}
