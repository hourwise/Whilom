import { describe, expect, it } from 'vitest';
import { credentialsSchema } from '@whilom/validation';
import { fieldErrorsFromZod } from './action-state';

describe('mobile action state helpers', () => {
  it('keeps shared validation errors field-addressable', () => {
    const parsed = credentialsSchema.safeParse({ email: 'not-an-email', password: 'short' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(fieldErrorsFromZod(parsed.error)).toEqual({ email: 'Invalid email', password: 'String must contain at least 8 character(s)' });
  });
});
