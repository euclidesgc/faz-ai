import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('kimiSignedIn', () => {
  // a sonda lê a pasta de credenciais da pasta de dados do Kimi Code; isola do KIMI_CODE_HOME da máquina
  const saved = process.env.KIMI_CODE_HOME;
  afterEach(() => {
    if (saved === undefined) delete process.env.KIMI_CODE_HOME;
    else process.env.KIMI_CODE_HOME = saved;
  });
  beforeEach(() => delete process.env.KIMI_CODE_HOME);

  it('true com credencial OAuth na pasta, false sem a pasta', async () => {
    const { kimiSignedIn } = await import('../src/extension/cliProbe');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-kimi-home-'));
    try {
      expect(kimiSignedIn(home)).toBe(false);
      fs.mkdirSync(path.join(home, '.kimi-code', 'credentials'), { recursive: true });
      expect(kimiSignedIn(home)).toBe(false);
      fs.writeFileSync(path.join(home, '.kimi-code', 'credentials', 'kimi-code-env-x.json'), '{}');
      expect(kimiSignedIn(home)).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('respeita o KIMI_CODE_HOME quando a variável existe', async () => {
    const { kimiSignedIn } = await import('../src/extension/cliProbe');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-kimi-home-'));
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-kimi-data-'));
    try {
      process.env.KIMI_CODE_HOME = data;
      fs.mkdirSync(path.join(data, 'credentials'), { recursive: true });
      fs.writeFileSync(path.join(data, 'credentials', 'kimi-code-env-x.json'), '{}');
      expect(kimiSignedIn(home)).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(data, { recursive: true, force: true });
    }
  });
});

describe('kimiModels', () => {
  it('lê os modelos do kimi provider list --json', async () => {
    const { kimiModels } = await import('../src/extension/cliProbe');
    mockOutput(
      0,
      JSON.stringify({
        providers: {},
        models: {
          'kimi-code/kimi-for-coding': {
            provider: 'managed:kimi-code',
            model: 'kimi-for-coding',
            displayName: 'K2.8 Preview',
            supportEfforts: ['low', 'high', 'max'],
            defaultEffort: 'max',
          },
          'kimi-code/k3-256k': { provider: 'managed:kimi-code', model: 'k3-256k', displayName: 'K3-256k' },
        },
      }),
    );

    const models = await kimiModels('kimi', undefined);
    expect(models).toEqual([
      {
        id: 'kimi:kimi-code/kimi-for-coding',
        tool: 'kimi',
        model: 'kimi-code/kimi-for-coding',
        label: 'K2.8 Preview',
        efforts: ['low', 'high', 'max'],
        defaultEffort: 'max',
        fromTool: true,
      },
      {
        id: 'kimi:kimi-code/k3-256k',
        tool: 'kimi',
        model: 'kimi-code/k3-256k',
        label: 'K3-256k',
        efforts: [],
        defaultEffort: null,
        fromTool: true,
      },
    ]);
  });

  it('saída inválida ou comando que falha viram lista vazia', async () => {
    const { kimiModels } = await import('../src/extension/cliProbe');
    mockOutput(0, 'não é json');
    expect(await kimiModels('kimi', undefined)).toEqual([]);
    mockOutput(1, '');
    expect(await kimiModels('kimi', undefined)).toEqual([]);
  });
});
describe('sondas dos perfis revisados', () => {
  const profile = {
    id: 'pessoal',
    name: 'Pessoal',
    kind: 'custom' as const,
    base: 'generic' as const,
    enabled: true,
    position: 3,
    config: { command: 'custom', versionArgs: '--about version', env: { TOKEN: 'sentinela-segredo' } },
    credentials: { secretRef: 'a'.repeat(64), review: 'reviewed' as const, available: true },
  };
  beforeEach(() => execFileMock.mockReset());
  it('versão usa argumentos separados, ambiente privado e nenhum shell; não devolve saída bruta', async () => {
    const { profileVersion } = await import('../src/extension/cliProbe');
    mockOutput(0, 'custom 1.2.3 sentinela-segredo');
    expect(await profileVersion(profile, '/usr/bin/custom')).toBe('1.2.3');
    expect(execFileMock).toHaveBeenCalledWith(
      '/usr/bin/custom',
      ['--about', 'version'],
      expect.objectContaining({ shell: false, env: expect.objectContaining({ TOKEN: 'sentinela-segredo' }) }),
      expect.any(Function),
    );
    mockOutput(0, 'sentinela-segredo');
    expect(await profileVersion(profile, '/usr/bin/custom')).toBeNull();
  });
  it('sem statusArgs não consulta; status retorna verdadeiro, falso ou desconhecido', async () => {
    const { profileSignedIn } = await import('../src/extension/cliProbe');
    expect(await profileSignedIn(profile, 'custom', '/home')).toBeNull();
    expect(execFileMock).not.toHaveBeenCalled();
    const selected = { ...profile, config: { ...profile.config, statusArgs: 'auth status' } };
    mockOutput(0, '');
    expect(await profileSignedIn(selected, 'custom', '/home')).toBe(true);
    mockOutput(1, '');
    expect(await profileSignedIn(selected, 'custom', '/home')).toBe(false);
    execFileMock.mockImplementationOnce((_file, _args, _opts, cb) =>
      cb(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), '', ''),
    );
    expect(await profileSignedIn(selected, 'custom', '/home')).toBeNull();
  });
  it('perfil pendente, desligado ou sem credencial local não inicia consulta', async () => {
    const { profileVersion, profileSignedIn } = await import('../src/extension/cliProbe');
    for (const selected of [
      { ...profile, enabled: false },
      { ...profile, credentials: { ...profile.credentials, review: 'pending' as const } },
      { ...profile, credentials: { ...profile.credentials, available: false } },
    ]) {
      expect(await profileVersion(selected, 'custom')).toBeNull();
      expect(await profileSignedIn(selected, 'custom', '/home')).toBeNull();
    }
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
