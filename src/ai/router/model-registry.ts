import { Injectable } from '@nestjs/common';

import { supportsRequiredCapabilities } from './capability-matcher';
import type { AiCapabilityRequirement } from '../types/ai-capability.types';
import type { AiModelDescriptor } from '../types/model.types';

/** A registered model plus the one piece of routing metadata `AiModelDescriptor` deliberately does not carry (README rationale: kept off the frozen-shape descriptor so its exact fields match the commissioning brief precisely). */
export interface RegisteredModel {
  readonly descriptor: AiModelDescriptor;
  /** Explicit only — never inferred from `descriptor.local`. Mirrors `ProviderRegistration.free` (`provider-registry.ts`). */
  readonly free: boolean;
}

/**
 * Holds `AiModelDescriptor` entries and answers "which models could serve
 * this request?" — filtering by `enabled`, by capability requirement, and
 * by explicit provider/model override. It makes no business decision about
 * WHICH of several eligible candidates to actually use; that ranking lives
 * in `model-router.provider.ts`, which is the only reader of this registry.
 */
@Injectable()
export class ModelRegistry {
  private readonly models: RegisteredModel[] = [];

  register(model: RegisteredModel): void {
    this.models.push(model);
  }

  /** Every registered model, including disabled ones. */
  all(): readonly RegisteredModel[] {
    return [...this.models];
  }

  /** Registered models with `descriptor.enabled === true`. */
  enabled(): readonly RegisteredModel[] {
    return this.models.filter((model) => model.descriptor.enabled);
  }

  /**
   * The enabled model(s) whose `descriptor.modelId` matches `modelId`
   * exactly — the explicit-override lookup (`AiInvocationRequest.model`).
   * `modelId` alone (not a `provider:modelId` pair) is what
   * `AiInvocationRequest.model` has always carried, so this searches across
   * every registered provider; more than one match means the caller's
   * override is ambiguous across providers and the router reports that as
   * a configuration defect rather than guessing (`model-router.provider.ts`).
   */
  findByModelId(modelId: string): readonly RegisteredModel[] {
    return this.models.filter((model) => model.descriptor.modelId === modelId && model.descriptor.enabled);
  }

  /** Enabled candidates satisfying `requirement.required` capabilities. `requirement` absent means no capability constraint. */
  candidatesForCapabilities(requirement: AiCapabilityRequirement | undefined): readonly RegisteredModel[] {
    const required = requirement?.required ?? [];
    if (required.length === 0) return this.enabled();
    return this.enabled().filter((model) =>
      supportsRequiredCapabilities(model.descriptor.capabilities, required),
    );
  }
}
