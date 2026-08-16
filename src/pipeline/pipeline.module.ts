import { Module } from '@nestjs/common';

import { StrategyModule } from '../agents/strategy/strategy.module';
import { TopicDiscoveryModule } from '../agents/topic-discovery/topic-discovery.module';
import { ResearchModule } from '../agents/research/research.module';
import { FactVerificationModule } from '../agents/fact-verification/fact-verification.module';
import { StoryArchitectModule } from '../agents/story-architect/story-architect.module';
import { ScriptWriterModule } from '../agents/script-writer/script-writer.module';
import { ScriptReviewerModule } from '../agents/script-reviewer/script-reviewer.module';
import { ScenePlannerModule } from '../agents/scene-planner/scene-planner.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

/**
 * Composes the 8 already-existing agent modules into one HTTP-reachable
 * pipeline. This module owns orchestration only — it imports each agent
 * module and calls each one's already-public `Service.execute()`; it
 * never reaches into an agent's internals and no agent module changed to
 * support this (`ARC-001` §7.2).
 */
@Module({
  imports: [
    StrategyModule,
    TopicDiscoveryModule,
    ResearchModule,
    FactVerificationModule,
    StoryArchitectModule,
    ScriptWriterModule,
    ScriptReviewerModule,
    ScenePlannerModule,
  ],
  controllers: [PipelineController],
  providers: [PipelineService],
})
export class PipelineModule {}
