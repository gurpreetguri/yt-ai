import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { aiConfig } from './config/ai.config';
import { StrategyModule } from './agents/strategy/strategy.module';
import { TopicDiscoveryModule } from './agents/topic-discovery/topic-discovery.module';
import { ResearchModule } from './agents/research/research.module';
import { FactVerificationModule } from './agents/fact-verification/fact-verification.module';
import { StoryArchitectModule } from './agents/story-architect/story-architect.module';
import { ScriptWriterModule } from './agents/script-writer/script-writer.module';
import { ScriptReviewerModule } from './agents/script-reviewer/script-reviewer.module';
import { ScenePlannerModule } from './agents/scene-planner/scene-planner.module';
import { PipelineModule } from './pipeline/pipeline.module';

/**
 * Root application module.
 *
 * Agent 00 (Strategy Agent) through Agent 07 (Scene Planner Agent) are
 * wired here, each still callable independently. `PipelineModule` is the
 * one and only place that composes them into a sequence — the dev
 * observability endpoint (`POST /api/pipeline/run`), not a general-purpose
 * workflow engine. No agent module changed, and no agent calls another
 * agent directly (STD-000 Rule 2); `PipelineModule` calls each agent's own
 * public `Service.execute()` from outside, exactly as `ARC-001` §7.2
 * assigns composition to the workflow layer. Still no database, no queue
 * infrastructure. Future agents register alongside these eight, never
 * inside any of them.
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
    StoryArchitectModule,
    ScriptWriterModule,
    ScriptReviewerModule,
    ScenePlannerModule,
    PipelineModule,
  ],
})
export class AppModule {}
