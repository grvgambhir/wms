// MFA for OC sessions is in MfaGuard (GetUser enrolment check). This module is
// the login/refresh surface; privileged-route enforcement lives beside RolesGuard.

import { Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { MfaGuard } from './guards/mfa.guard';
import { RolesGuard } from './guards/roles.guard';
import { env } from '../config/env';
import { CognitoIdentityProvider } from './identity/cognito.identity-provider';
import { IDENTITY_PROVIDER } from './identity/identity-provider';
import { LocalIdentityProvider } from './identity/local.identity-provider';
import { LoginRateLimiter } from './login-rate-limiter';
import { seedDevUsers } from './seed';
import { CALLER_MFA_SOURCE, callerMfaSourceFromEnv } from '../people/caller-mfa';

function identityProviderProviders() {
  if (env.AUTH_PROVIDER === 'local') {
    return [
      LocalIdentityProvider,
      { provide: IDENTITY_PROVIDER, useExisting: LocalIdentityProvider },
    ];
  }
  return [
    {
      provide: CognitoIdentityProvider,
      useFactory: () => new CognitoIdentityProvider(),
    },
    { provide: IDENTITY_PROVIDER, useExisting: CognitoIdentityProvider },
  ];
}

@Module({
  controllers: [AuthController],
  providers: [
    ...identityProviderProviders(),
    LoginRateLimiter,
    AuthService,
    AuthGuard,
    RolesGuard,
    MfaGuard,
    { provide: CALLER_MFA_SOURCE, useFactory: callerMfaSourceFromEnv },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_GUARD, useExisting: MfaGuard },
  ],
  exports: [IDENTITY_PROVIDER, LoginRateLimiter],
})
export class AuthModule implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await seedDevUsers();
  }
}
