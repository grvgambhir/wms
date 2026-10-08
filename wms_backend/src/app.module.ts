/**
 * Root Nest module. Bounded-context modules (rules, money) arrive later.
 */
import { Module, OnApplicationShutdown } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { log } from './common/logging/logger';
import { closeDb } from './db/pool';
import { ProductionDatabaseRoleGuard } from './db/production-database-role.guard';
import { AccreditationModule } from './accreditation/accreditation.module';
import { CompetitionModule } from './competition/competition.module';
import { FinanceModule } from './finance/finance.module';
import { EvidenceModule } from './evidence/evidence.module';
import { HealthController, MetricsController } from './health/health.controller';
import { PeopleModule } from './people/people.module';
import { RegistrationModule } from './registration/registration.module';
import { RosterModule } from './roster/roster.module';
import { OpsModule } from './ops/ops.module';
import { RulesModule } from './rules/rules.module';

@Module({
  imports: [
    AuthModule,
    PeopleModule,
    RegistrationModule,
    EvidenceModule,
    RosterModule,
    AccreditationModule,
    RulesModule,
    OpsModule,
    FinanceModule,
    CompetitionModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [ProductionDatabaseRoleGuard],
})
export class AppModule implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string): Promise<void> {
    log.info('shutdown', { signal: signal ?? 'unknown' });
    await closeDb();
  }
}
