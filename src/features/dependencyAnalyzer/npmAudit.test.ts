import { getAuditReport } from './npmAudit';

describe('getAuditReport', () => {
  it('parses npm audit --json vulnerabilities with severity', async () => {
    const runCommand = jest.fn().mockResolvedValue({
      stdout: JSON.stringify({
        vulnerabilities: {
          minimist: { severity: 'critical', range: '<1.2.6', fixAvailable: true },
          debug: { severity: 'low', range: '<2.6.9', fixAvailable: false }
        },
        metadata: { dependencies: { total: 250 } }
      }),
      stderr: ''
    });

    const report = await getAuditReport('/repo', runCommand);

    expect(report.totalInstalledPackages).toBe(250);
    expect(report.vulnerabilities).toEqual([
      { name: 'minimist', severity: 'critical', range: '<1.2.6', fixAvailable: true },
      { name: 'debug', severity: 'low', range: '<2.6.9', fixAvailable: false }
    ]);
  });

  it('returns an empty report when stdout is empty', async () => {
    const runCommand = jest.fn().mockResolvedValue({ stdout: '', stderr: '' });

    await expect(getAuditReport('/repo', runCommand)).resolves.toEqual({
      vulnerabilities: [],
      totalInstalledPackages: 0
    });
  });

  it('does not throw on malformed JSON', async () => {
    const runCommand = jest.fn().mockResolvedValue({ stdout: '{not valid', stderr: '' });

    await expect(getAuditReport('/repo', runCommand)).resolves.toEqual({
      vulnerabilities: [],
      totalInstalledPackages: 0,
      error: 'npm audit returned output that could not be parsed.'
    });
  });

  it('falls back to "info" severity for an unrecognized severity value', async () => {
    const runCommand = jest.fn().mockResolvedValue({
      stdout: JSON.stringify({ vulnerabilities: { weird: { severity: 'unknown-level' } } }),
      stderr: ''
    });

    const report = await getAuditReport('/repo', runCommand);

    expect(report.vulnerabilities[0].severity).toBe('info');
  });
});
