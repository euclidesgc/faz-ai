import { describe, expect, it, vi } from 'vitest';

const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({ execFile: (...args: unknown[]) => execFileMock(...args) }));

function mockOutput(code: number | null, stdout: string, stderr = ''): void {
  execFileMock.mockImplementationOnce((_file, _args, _opts, cb) => {
    const err = code === 0 || code === null ? null : Object.assign(new Error('exit'), { code });
    cb(err, stdout, stderr);
  });
}

describe('claudeSignedIn', () => {
  it('should return true when claude auth status reports loggedIn true', async () => {
    const { claudeSignedIn } = await import('../src/extension/cliProbe');
    mockOutput(0, JSON.stringify({ loggedIn: true }));

    expect(await claudeSignedIn('claude', undefined)).toBe(true);
  });

  it('should return false when claude auth status reports loggedIn false', async () => {
    const { claudeSignedIn } = await import('../src/extension/cliProbe');
    mockOutput(0, JSON.stringify({ loggedIn: false }));

    expect(await claudeSignedIn('claude', undefined)).toBe(false);
  });

  it('should return null when stdout is not valid JSON', async () => {
    const { claudeSignedIn } = await import('../src/extension/cliProbe');
    mockOutput(0, 'not json');

    expect(await claudeSignedIn('claude', undefined)).toBeNull();
  });

  it('should return null when stdout is empty', async () => {
    const { claudeSignedIn } = await import('../src/extension/cliProbe');
    mockOutput(0, '');

    expect(await claudeSignedIn('claude', undefined)).toBeNull();
  });

  it('should return null when the command exits with a non-zero code', async () => {
    const { claudeSignedIn } = await import('../src/extension/cliProbe');
    mockOutput(1, '');

    expect(await claudeSignedIn('claude', undefined)).toBeNull();
  });
});
