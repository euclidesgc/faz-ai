import { describe, expect, it } from 'vitest';
import { exceedsRunLimit, RUN_CACHE_READ_LIMIT } from '../src/shared/runLimit';

describe('exceedsRunLimit', () => {
  it('só passa acima do limite; sem medida não passa', () => {
    expect(exceedsRunLimit(RUN_CACHE_READ_LIMIT + 1)).toBe(true);
    expect(exceedsRunLimit(RUN_CACHE_READ_LIMIT)).toBe(false);
    expect(exceedsRunLimit(0)).toBe(false);
    expect(exceedsRunLimit(null)).toBe(false);
    expect(exceedsRunLimit(undefined)).toBe(false);
  });
});
