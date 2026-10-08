import { Module } from '@nestjs/common';
import { COGNITO_USER_ADMIN, cognitoUserAdminFromEnv } from '../auth/identity/cognito-user-admin';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { runPgTransaction } from '../db/pg-transaction';
import { pool } from '../db/pool';
import { AdminPeopleController } from './admin-people.controller';
import { AdminPeopleService } from './admin-people.service';
import { CALLER_EMAIL_SOURCE, callerEmailSourceFromEnv } from './caller-email';
import { CALLER_MFA_SOURCE, callerMfaSourceFromEnv } from './caller-mfa';
import { ConsentService } from './consent.service';
import { MeController } from './me.controller';
import { SelfServiceService } from './self-service.service';
import { PeopleService } from './people.service';
import { PreRegistrationService } from './pre-registration.service';

@Module({
  controllers: [MeController, AdminPeopleController],
  providers: [
    {
      provide: IdempotencyService,
      useFactory: () => new IdempotencyService(runPgTransaction, pool),
    },
    { provide: CALLER_EMAIL_SOURCE, useFactory: callerEmailSourceFromEnv },
    { provide: CALLER_MFA_SOURCE, useFactory: callerMfaSourceFromEnv },
    { provide: COGNITO_USER_ADMIN, useFactory: cognitoUserAdminFromEnv },
    PeopleService,
    { provide: SelfServiceService, useFactory: () => new SelfServiceService(pool) },
    AdminPeopleService,
    ConsentService,
    PreRegistrationService,
  ],
})
export class PeopleModule {}
