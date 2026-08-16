import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { PipelineService } from './pipeline.service';
import { PipelineRunRequest, PipelineRunResponse } from './pipeline.types';

/**
 * `POST /api/pipeline/run` — the observability UI's single entry point.
 * Accepts `{topic, niche, audience}`, runs the real 8-agent pipeline
 * (`PipelineService`), and returns `{steps, finalOutput}` exactly as the
 * UI's `lib/api.ts` already expects (that fallback path stays untouched —
 * once this endpoint exists and responds, the UI simply stops needing it).
 */
@Controller('api/pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Post('run')
  @HttpCode(200)
  async run(@Body() body: PipelineRunRequest): Promise<PipelineRunResponse> {
    const request: PipelineRunRequest = {
      topic: typeof body?.topic === 'string' ? body.topic : '',
      niche: typeof body?.niche === 'string' ? body.niche : '',
      audience: typeof body?.audience === 'string' ? body.audience : '',
    };
    return this.pipelineService.run(request);
  }
}
