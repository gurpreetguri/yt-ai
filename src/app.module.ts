import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { aiConfig } from './config/ai.config';
import { StrategyModule } from './agents/strategy/strategy.module';
import { TopicDiscoveryModule } from './agents/topic-discovery/topic-discovery.module';
import { ResearchModule } from './agents/research/research.module';
import { FactVerificationModule } from './agents/fact-verification/fact-verification.module';

/**
 * Root application module.
 *
 * Only Agent 00 (Strategy Agent), Agent 01 (Topic Discovery Agent), Agent 02
 * (Research Agent), and Agent 03 (Fact Verification Agent) are wired here
 * (STD-000 §13 — no workflow engine, no other agents, no database, no queue
 * infrastructure yet). No agent calls another agent directly (STD-000 Rule
 * 2); composing them is exclusively the future workflow engine's job
 * (ARC-001 §7.2). Future agents register alongside these four, never inside
 * any of them.
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
    ResearchModule,
    FactVerificationModule,
  ],
})
export class AppModule {}
