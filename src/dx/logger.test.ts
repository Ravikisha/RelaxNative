import { describe, it, expect, afterEach } from 'vitest';

import { isDebugEnabled, setDebugEnabled } from './logger.js';

describe('dx logger', () => {
  const prev = process.env.RELAXNATIVE_DEBUG;

  afterEach(() => {
    setDebugEnabled(false);
    if (prev == null) delete process.env.RELAXNATIVE_DEBUG;
    else process.env.RELAXNATIVE_DEBUG = prev;
  });

  it('is disabled by default', () => {
    delete process.env.RELAXNATIVE_DEBUG;
    expect(isDebugEnabled()).toBe(false);
  });

  it('enables via env var', () => {
    process.env.RELAXNATIVE_DEBUG = '1';
    expect(isDebugEnabled()).toBe(true);
  });

  it('enables via setter (tests)', () => {
    delete process.env.RELAXNATIVE_DEBUG;
    setDebugEnabled(true);
    expect(isDebugEnabled()).toBe(true);
  });
});
