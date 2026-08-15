import {
  calculateCapabilityScore,
  filterByCapabilities,
  supportsRequiredCapabilities,
} from './capability-matcher';
import type { AiModelDescriptor } from '../types/model.types';

function descriptor(overrides: Partial<AiModelDescriptor> = {}): AiModelDescriptor {
  return {
    provider: 'test-provider',
    modelId: 'test-model',
    capabilities: ['TEXT'],
    contextWindow: 8000,
    maxOutputTokens: 4000,
    supportsStructuredOutput: false,
    local: false,
    enabled: true,
    priority: 0,
    quality: 'BALANCED',
    ...overrides,
  };
}

describe('capability-matcher', () => {
  describe('supportsRequiredCapabilities', () => {
    // 1. all required capabilities present.
    it('returns true when every required capability is present', () => {
      expect(
        supportsRequiredCapabilities(
          ['TEXT', 'STRUCTURED_OUTPUT', 'REASONING'],
          ['TEXT', 'STRUCTURED_OUTPUT'],
        ),
      ).toBe(true);
    });

    // 2. missing required capability.
    it('returns false when a required capability is missing', () => {
      expect(supportsRequiredCapabilities(['TEXT'], ['TEXT', 'VISION'])).toBe(false);
    });

    // 4. no capability requirements.
    it('returns true when required is empty, regardless of model capabilities', () => {
      expect(supportsRequiredCapabilities([], [])).toBe(true);
      expect(supportsRequiredCapabilities(['TEXT'], [])).toBe(true);
    });

    // 5. structured output requirement.
    it('returns false for a STRUCTURED_OUTPUT requirement when the model lacks it', () => {
      expect(supportsRequiredCapabilities(['TEXT', 'REASONING'], ['STRUCTURED_OUTPUT'])).toBe(false);
    });

    it('returns true for a STRUCTURED_OUTPUT requirement when the model has it', () => {
      expect(supportsRequiredCapabilities(['TEXT', 'STRUCTURED_OUTPUT'], ['STRUCTURED_OUTPUT'])).toBe(true);
    });

    // 6. vision requirement.
    it('returns false for a VISION requirement when the model lacks it', () => {
      expect(supportsRequiredCapabilities(['TEXT'], ['VISION'])).toBe(false);
    });

    it('returns true for a VISION requirement when the model has it', () => {
      expect(supportsRequiredCapabilities(['TEXT', 'VISION'], ['VISION'])).toBe(true);
    });
  });

  describe('calculateCapabilityScore', () => {
    it('returns 0 when preferred is undefined', () => {
      expect(calculateCapabilityScore(['TEXT', 'VISION'], undefined)).toBe(0);
    });

    it('returns 0 when preferred is empty', () => {
      expect(calculateCapabilityScore(['TEXT', 'VISION'], [])).toBe(0);
    });

    // 3. preferred capability.
    it('counts how many preferred capabilities the model has', () => {
      expect(
        calculateCapabilityScore(['TEXT', 'VISION', 'REASONING'], ['VISION', 'REASONING', 'TOOL_CALLING']),
      ).toBe(2);
    });

    it('returns 0 when the model has none of the preferred capabilities', () => {
      expect(calculateCapabilityScore(['TEXT'], ['VISION', 'TOOL_CALLING'])).toBe(0);
    });
  });

  describe('filterByCapabilities', () => {
    const models = [
      descriptor({ modelId: 'text-only', capabilities: ['TEXT'] }),
      descriptor({ modelId: 'text-and-vision', capabilities: ['TEXT', 'VISION'] }),
      descriptor({
        modelId: 'full',
        capabilities: ['TEXT', 'VISION', 'STRUCTURED_OUTPUT', 'TOOL_CALLING', 'REASONING'],
      }),
    ];

    // 4. no capability requirements.
    it('returns every model unchanged when requirement is undefined', () => {
      expect(filterByCapabilities(models, undefined)).toEqual(models);
    });

    it('returns every model unchanged when required is empty', () => {
      expect(filterByCapabilities(models, { required: [] })).toEqual(models);
    });

    // 5. structured output requirement.
    it('keeps only models supporting STRUCTURED_OUTPUT', () => {
      const result = filterByCapabilities(models, { required: ['STRUCTURED_OUTPUT'] });
      expect(result.map((model) => model.modelId)).toEqual(['full']);
    });

    // 6. vision requirement.
    it('keeps only models supporting VISION', () => {
      const result = filterByCapabilities(models, { required: ['VISION'] });
      expect(result.map((model) => model.modelId)).toEqual(['text-and-vision', 'full']);
    });

    it('excludes every model when no candidate satisfies a combined requirement', () => {
      const result = filterByCapabilities(models, { required: ['VISION', 'TOOL_CALLING', 'REASONING'] });
      expect(result.map((model) => model.modelId)).toEqual(['full']);
    });
  });
});
