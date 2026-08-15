import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { aiConfig } from './config/ai.config';
import { StrategyModule } from './agents/strategy/strategy.module';
import { TopicDiscoveryModule } from './agents/topic-discovery/topic-discovery.module';

/**
 * Root application module.
 *
 * Only Agent 00 (Strategy Agent) and Agent 01 (Topic Discovery Agent) are
 * wired here (STD-000 §13 — no workflow engine, no other agents, no
 * database, no queue infrastructure yet). Neither agent calls the other or
 * any other agent directly (STD-000 Rule 2); composing them is exclusively
 * the future workflow engine's job (ARC-001 §7.2). Future agents register
 * alongside these two, never inside either of them.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [aiConfig],
      envFilePath: ['.env'],
    }),
    StrategyModule,
    TopicDiscoveryModule,
  ],
})
export class AppModule {}
