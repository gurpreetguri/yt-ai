import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { aiConfig } from './config/ai.config';
import { StrategyModule } from './agents/strategy/strategy.module';

/**
 * Root application module.
 *
 * Only Agent 00 (Strategy Agent) is wired here (STD-000 §13 — no workflow
 * engine, no other agents, no database, no queue infrastructure yet). Future
 * agents register alongside `StrategyModule`, never inside it.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [aiConfig],
      envFilePath: ['.env'],
    }),
    StrategyModule,
  ],
})
export class AppModule {}
