import { describe, expect, it, vi } from 'vitest';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import { probeProfiles, type ProfileProbeDeps } from '../src/extension/profileProbe';

const claude = BUILTIN_PROFILES[0]!;
const cursor = BUILTIN_PROFILES[1]!;
const pending: AiProfile = {
  ...claude,
  id: 'importado',
  kind: 'custom',
  base: 'generic',
  credentials: { secretRef: 'x', review: 'pending', available: false },
};
const deps = (over: Partial<ProfileProbeDeps> = {}): ProfileProbeDeps => ({
  resolve: (p) => `/bin/${p.id}`,
  version: async () => '1.2.3',
  signedIn: async () => true,
  ...over,
});

describe('probeProfiles', () => {
  it('perfil pendente de revisão não chama nenhuma dependência e não aparece no resultado', async () => {
    const d = { resolve: vi.fn(), version: vi.fn(), signedIn: vi.fn() };
    expect((await probeProfiles([pending], d)).size).toBe(0);
    expect(d.resolve).not.toHaveBeenCalled();
    expect(d.version).not.toHaveBeenCalled();
    expect(d.signedIn).not.toHaveBeenCalled();
  });

  it('CLI achada: caminho, versão e login', async () => {
    const map = await probeProfiles([claude], deps());
    expect(map.get('claude')).toEqual({ id: 'claude', found: true, path: '/bin/claude', version: '1.2.3', login: 'signed-in' });
  });

  it('CLI ausente: login não conferido e nenhum comando de versão ou login', async () => {
    const d = deps({ resolve: () => null, version: vi.fn(), signedIn: vi.fn() });
    expect((await probeProfiles([cursor], d)).get('cursor')).toEqual({ id: 'cursor', found: false, login: 'unchecked' });
    expect(d.version).not.toHaveBeenCalled();
  });

  it('signedIn nulo ou com falha vira unchecked; false vira signed-out; versão ausente fica de fora', async () => {
    const run = async (signedIn: ProfileProbeDeps['signedIn'], version: ProfileProbeDeps['version'] = async () => null) =>
      (await probeProfiles([claude], deps({ signedIn, version }))).get('claude')!;
    expect((await run(async () => null)).login).toBe('unchecked');
    expect((await run(async () => Promise.reject(new Error('x')))).login).toBe('unchecked');
    const out = await run(async () => false);
    expect(out.login).toBe('signed-out');
    expect(out).not.toHaveProperty('version');
  });

  it('os perfis rodam em paralelo: um probe lento não atrasa os outros', async () => {
    let release!: () => void;
    const slow = new Promise<string | null>((resolve) => (release = () => resolve('9.9.9')));
    const started: string[] = [];
    const pending = probeProfiles(
      [claude, cursor],
      deps({
        version: (p) => {
          started.push(p.id);
          return p.id === 'claude' ? slow : Promise.resolve('1.0.0');
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(started.sort()).toEqual(['claude', 'cursor']);
    release();
    const map = await pending;
    expect(map.get('claude')?.version).toBe('9.9.9');
    expect(map.get('cursor')?.version).toBe('1.0.0');
  });
});
