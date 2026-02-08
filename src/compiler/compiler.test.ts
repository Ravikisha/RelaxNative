import { describe, it, expect } from 'vitest';

import { detectCompilers } from './detect.js';

describe('compiler detection', () => {
  it('detects C compiler', () => {
    const result = detectCompilers();
    expect(result.c).toBeDefined();
    expect(result.c.path.length).toBeGreaterThan(0);
  });
});
