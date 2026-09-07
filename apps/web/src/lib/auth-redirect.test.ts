import { describe, expect, it } from 'vitest';
import { authConfirmUrl, resolveAuthOrigin } from './auth-redirect';

describe('auth redirect origin policy', () => {
  it('allows the exact preview host', () => {
    expect(resolveAuthOrigin('whilom-web-preview.philgeran.workers.dev')).toBe(
      'https://whilom-web-preview.philgeran.workers.dev',
    );
  });

  it('allows the exact future production host', () => {
    expect(resolveAuthOrigin('whilom.co.uk')).toBe('https://whilom.co.uk');
  });

  it('allows local development only at the documented local origin', () => {
    expect(resolveAuthOrigin('localhost:3000')).toBe('http://localhost:3000');
  });

  it('rejects arbitrary or forwarded deployment hosts', () => {
    expect(resolveAuthOrigin('attacker.example')).toBeNull();
    expect(resolveAuthOrigin('whilom-web-preview.philgeran.workers.dev.evil')).toBeNull();
    expect(resolveAuthOrigin('')).toBeNull();
  });

  it('builds a fixed callback path without query injection', () => {
    expect(authConfirmUrl('https://whilom.co.uk')).toBe('https://whilom.co.uk/auth/confirm');
  });
});
