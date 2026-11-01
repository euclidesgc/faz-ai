// A coordenação das verificações do host (`ai/verifications.ts`, história 7): uma por perfil e por estado da
// chave, e a automática que não corre por cima do Conectar.
import { describe, expect, it } from 'vitest';
import { Verifications, type VerificationsDeps } from '../src/extension/ai/verifications';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';

function setup(over: Partial<VerificationsDeps<string>> = {}) {
  const profiles = new Map<string, AiProfile>(BUILTIN_PROFILES.map((p) => [p.id, { ...structuredClone(p), enabled: true }]));
  let key = '';
  const runs: string[] = [];
  const pending: (() => void)[] = [];
  const log: string[] = [];
  const v = new Verifications<string>({
    profile: (id) => profiles.get(id) ?? null,
    run: (id) => {
      runs.push(`${id}:${key || 'sem chave'}`);
      return new Promise((resolve) => pending.push(() => resolve(`ok ${id}`)));
    },
    keyState: () => key,
    current: () => false,
    busy: () => false,
    message: (r) => r,
    log: (l) => log.push(l),
    ...over,
  });
  return { v, runs, pending, log, profiles, setKey: (k: string) => (key = k) };
}

describe('Verifications', () => {
  it('a mesma verificação pedida duas vezes com a mesma chave roda uma vez só', () => {
    const s = setup();
    expect(s.v.detailed('gemini')).toBe(s.v.detailed('gemini'));
    expect(s.runs).toEqual(['gemini:sem chave']);
  });

  it('a verificação começada sem a chave não é reaproveitada por quem já tem a chave', async () => {
    const s = setup();
    void s.v.detailed('gemini');
    s.setKey('digest-da-chave');
    const withKey = s.v.detailed('gemini');
    expect(s.runs).toEqual(['gemini:sem chave', 'gemini:digest-da-chave']);
    s.pending.forEach((fn) => fn());
    await expect(withKey).resolves.toBe('ok gemini');
    expect(s.v.isRunning('gemini')).toBe(false);
  });

  it('em segundo plano: só agente ACP ligado, sem prova em vigor, sem outra em andamento e fora do Conectar', async () => {
    let busy = true;
    const s = setup({ busy: () => busy });
    s.v.inBackground('gemini', 'perfil ligado');
    expect(s.runs).toEqual([]);
    busy = false;
    s.v.inBackground('claude', 'perfil ligado');
    s.profiles.get('opencode')!.enabled = false;
    s.v.inBackground('opencode', 'perfil ligado');
    expect(s.runs).toEqual([]);
    s.v.inBackground('gemini', 'perfil ligado');
    s.v.inBackground('gemini', 'conferência');
    expect(s.runs).toEqual(['gemini:sem chave']);
    s.pending.forEach((fn) => fn());
    await expect.poll(() => s.log).toEqual(['Verificação de capacidades (perfil ligado): ok gemini']);
    const current = setup({ current: () => true });
    current.v.inBackground('gemini', 'perfil ligado');
    expect(current.runs).toEqual([]);
  });
});
