import { describe, expect, it } from 'vitest';
import { userFacingLabel, type PromptType } from './index';

describe('userFacingLabel', () => {
  it.each<[PromptType, ReturnType<typeof userFacingLabel>]>([
    ['ASK', 'Say this'],
    ['CLOSE', 'Say this'],
    ['REFRAME', 'Say this'],
    ['WARN', 'Careful'],
    ['BODY', 'Careful'],
    ['SILENCE', 'Careful'],
    ['IDLE', 'Idle'],
  ])('%s → %s', (type, label) => {
    expect(userFacingLabel(type)).toBe(label);
  });
});
