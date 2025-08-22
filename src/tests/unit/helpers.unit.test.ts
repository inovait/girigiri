import { validateEnvVar, envToBool } from '../../helpers.ts'; // adjust path if needed


describe('validateEnvVar', () => {
  it('returns the value when it is provided', () => {
    const result = validateEnvVar('DB_HOST', 'localhost');
    expect(result).toBe('localhost');
  });

  it('throws an Error if value is undefined', () => {
    expect(() => validateEnvVar('DB_HOST', undefined)).toThrow(
      'Missing required environment variable: DB_HOST'
    );
  });

  it('throws an Error if value is an empty string', () => {
    expect(() => validateEnvVar('DB_HOST', '')).toThrow(
      'Missing required environment variable: DB_HOST'
    );
  });
});

describe('envToBool', () => {
  it('returns true for "true", "1", "yes", "on" (case-insensitive)', () => {
    expect(envToBool('true')).toBe(true);
    expect(envToBool('TRUE')).toBe(true);
    expect(envToBool('1')).toBe(true);
    expect(envToBool('yes')).toBe(true);
    expect(envToBool('on')).toBe(true);
    expect(envToBool('ON')).toBe(true);
  });

  it('returns false for undefined, empty string, or other values', () => {
    expect(envToBool('')).toBe(false);
    expect(envToBool(undefined as unknown as string)).toBe(false);
    expect(envToBool('false')).toBe(false);
    expect(envToBool('0')).toBe(false);
    expect(envToBool('off')).toBe(false);
    expect(envToBool('random')).toBe(false);
  });
});
