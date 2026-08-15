import type { AiCapability } from './ai-capability.types';
import type { AiModelQuality } from './model-quality.types';

/**
 * A single routable model: one provider's one model, with everything the
 * router needs to decide whether and how eagerly to pick it
 * (`src/ai/router/model-registry.ts`, `model-router.provider.ts`). This
 * describes ROUTING metadata only — it is never surfaced to an agent, and
 * agents never construct or read one directly (ARC-001 §4.9).
 */
export interface AiModelDescriptor {
  readonly provider: string;
  readonly modelId: string;
  readonly capabilities: readonly AiCapability[];
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly supportsStructuredOutput: boolean;
  readonly local: boolean;
  readonly enabled: boolean;
  /** Higher ranks first when candidates are otherwise tied (`capability-matcher.ts`, `model-router.provider.ts`). */
  readonly priority: number;
  /** Operator-declared quality tier, not a benchmark result — see `model-quality.types.ts`. Every registered descriptor must set this explicitly. */
  readonly quality: AiModelQuality;
}
