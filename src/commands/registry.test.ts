import { COMMANDS, COMMAND_NAMES, type CommandEntry } from './registry';

// ─── COMMANDS array structure ─────────────────────────────────────────────────

describe('COMMANDS registry', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(COMMANDS)).toBe(true);
    expect(COMMANDS.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty name string', () => {
    for (const cmd of COMMANDS) {
      expect(typeof cmd.name).toBe('string');
      expect(cmd.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty summary string', () => {
    for (const cmd of COMMANDS) {
      expect(typeof cmd.summary).toBe('string');
      expect(cmd.summary.trim().length).toBeGreaterThan(0);
    }
  });

  it('every entry has a register function', () => {
    for (const cmd of COMMANDS) {
      expect(typeof cmd.register).toBe('function');
    }
  });

  it('names contain only lowercase letters, digits, and hyphens (valid CLI names)', () => {
    for (const cmd of COMMANDS) {
      expect(cmd.name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('has no duplicate names', () => {
    const unique = new Set(COMMANDS.map((c) => c.name));
    expect(unique.size).toBe(COMMANDS.length);
  });

  it('satisfies the CommandEntry interface shape on every element', () => {
    const requiredKeys: (keyof CommandEntry)[] = ['name', 'summary', 'register'];
    for (const cmd of COMMANDS) {
      for (const key of requiredKeys) {
        expect(cmd).toHaveProperty(key);
      }
    }
  });
});

// ─── COMMAND_NAMES derived array ──────────────────────────────────────────────

describe('COMMAND_NAMES', () => {
  it('is an array of strings', () => {
    expect(Array.isArray(COMMAND_NAMES)).toBe(true);
    for (const name of COMMAND_NAMES) {
      expect(typeof name).toBe('string');
    }
  });

  it('has the same length as COMMANDS', () => {
    expect(COMMAND_NAMES.length).toBe(COMMANDS.length);
  });

  it('mirrors COMMANDS in order', () => {
    expect(COMMAND_NAMES).toEqual(COMMANDS.map((c) => c.name));
  });

  it('contains all five expected command names', () => {
    expect(COMMAND_NAMES).toContain('auth');
    expect(COMMAND_NAMES).toContain('credits');
    expect(COMMAND_NAMES).toContain('init');
    expect(COMMAND_NAMES).toContain('verify');
    expect(COMMAND_NAMES).toContain('doctor');
  });
});
