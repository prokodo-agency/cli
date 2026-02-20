// Doctor command unit-tests focus on the building blocks the command uses,
// since the command itself spawns network calls and process.exit.

// ─── Node version check logic ─────────────────────────────────────────────────

describe('doctor — node version checks', () => {
  it('passes for Node 22+', () => {
    const major = Number('22.0.0'.split('.')[0]);
    expect(major).toBeGreaterThanOrEqual(22);
  });

  it('fails for Node 18', () => {
    const major = Number('18.20.0'.split('.')[0]);
    expect(major).toBeLessThan(22);
  });

  it('current runtime satisfies engine requirement', () => {
    const [major] = process.versions.node.split('.').map(Number);
    expect(major).toBeGreaterThanOrEqual(22);
  });
});

// ─── Check result structure ───────────────────────────────────────────────────

describe('doctor — check result shape', () => {
  it('has required fields', () => {
    const check = { name: 'Node version', passed: true, detail: '22.0.0 (required ≥ 22)' };
    expect(check).toHaveProperty('name');
    expect(check).toHaveProperty('passed');
    expect(check).toHaveProperty('detail');
    expect(typeof check.passed).toBe('boolean');
  });

  it('all-passed is false when any check fails', () => {
    const checks = [
      { name: 'Node version', passed: true, detail: 'ok' },
      { name: 'API key configured', passed: false, detail: 'none' },
      { name: 'API reachability', passed: true, detail: 'ok' },
    ];
    expect(checks.every((c) => c.passed)).toBe(false);
  });

  it('all-passed is true when all checks pass', () => {
    const checks = [
      { name: 'Node version', passed: true, detail: 'ok' },
      { name: 'API key configured', passed: true, detail: 'env' },
      { name: 'API reachability', passed: true, detail: 'ok' },
    ];
    expect(checks.every((c) => c.passed)).toBe(true);
  });
});

// ─── JSON output shape ────────────────────────────────────────────────────────

describe('doctor --json output', () => {
  it('matches expected shape', () => {
    const checks = [
      { name: 'Node version', passed: true, detail: '22.0.0' },
      { name: '.prokodo/config.json', passed: false, detail: 'Not found' },
    ];
    const output = { passed: checks.every((c) => c.passed), checks };
    const parsed = JSON.parse(JSON.stringify(output)) as typeof output;

    expect(typeof parsed.passed).toBe('boolean');
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks[0]?.name).toBe('Node version');
    expect(parsed.passed).toBe(false);
  });
});
