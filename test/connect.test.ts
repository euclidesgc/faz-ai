// O Conectar no host (épica "ferramenta por modo", história 7): o fluxo `connect(profileId)` com o host
// falso (`ConnectorDeps`), passo a passo, com o erro preso a cada passo, e a chave que nunca volta.
import { describe, expect, it } from 'vitest';
import { Connector, type ConnectorDeps } from '../src/extension/ai/connect';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import { regimeFromEvidence, type ConnectState, type ConnectSummary } from '../src/shared/connect';
import {
  ACP_CAPABILITY_CHECKS,
  CAPABILITY_CHECKS,
  EXECUTOR_CAPABILITIES,
  type CapabilityEvidence,
  type ExecutorCapability,
} from '../src/shared/executionAdmission';

const KEY = 'AIzaSy-chave-de-teste-123456';

/** As provas que o verificador grava: `outcome` por check, `passed` para os não citados. */
function evidence(transport: 'acp' | 'cli', outcomes: Record<string, 'failed' | 'unavailable'> = {}): CapabilityEvidence[] {
  const checks = transport === 'acp' ? ACP_CAPABILITY_CHECKS : CAPABILITY_CHECKS;
  return EXECUTOR_CAPABILITIES.map((capability: ExecutorCapability) => ({
    version: 1,
    capability,
    source: 'host-probe',
    binding: 'b'.repeat(64),
    checkedAt: 1,
    expiresAt: 2,
    checks: checks[capability].map((id) => ({ id, outcome: outcomes[`${capability}/${id}`] ?? 'passed', receipt: 'r'.repeat(64) })),
  }));
}
/** O ACP nunca prova os arquivos de contexto próprios do agente. */
const ACP_PROVEN = () => evidence('acp', { 'artifacts/own-context-files': 'unavailable' });

const ready = (id: string): AiProfile => structuredClone(BUILTIN_PROFILES.find((p) => p.id === id)!);

function host(over: Partial<ConnectorDeps> = {}) {
  const profiles = new Map<string, AiProfile>(BUILTIN_PROFILES.map((p) => [p.id, ready(p.id)]));
  profiles.set('pessoal', { ...ready('claude'), id: 'pessoal', name: 'Pessoal', kind: 'custom', tool: 'pessoal', base: 'generic' });
  const keys = new Map<string, string>();
  const reviews: Record<string, number> = {};
  const saved: Record<string, ConnectSummary> = {};
  const published: ConnectState[] = [];
  const calls: string[] = [];
  const deps: ConnectorDeps = {
    profile: (id) => profiles.get(id) ?? null,
    enable: (id) => {
      calls.push(`enable:${id}`);
      profiles.get(id)!.enabled = true;
    },
    resolve: (id) => profiles.get(id)!,
    locate: () => '/usr/local/bin/gemini',
    version: async () => '0.65.0',
    signedIn: async () => true,
    // como o `ToolKeys.replace`: a chave nova só entra depois de aceita
    keys: {
      get: (tool) => keys.get(tool) ?? null,
      replace: async (tool, key, accept) => {
        await accept(key);
        keys.set(tool, key);
      },
    },
    authenticate: async (_p, _exe, auth) => void calls.push(`authenticate:${auth.methodId}:${auth.apiKey}`),
    checkApiKey: async (_p, key) => {
      calls.push(`check:${key}`);
      return 4;
    },
    setMode: (id, mode) => {
      calls.push(`mode:${id}:${mode}`);
      profiles.get(id)!.mode = mode;
    },
    verify: async (id) => {
      calls.push(`verify:${id}`);
      return { evidence: ACP_PROVEN() };
    },
    reviewOf: (id) => reviews[id] ?? null,
    recordReview: (id) => (reviews[id] = (reviews[id] ?? 0) + 1),
    revokeReview: (id) => {
      calls.push(`revoke:${id}`);
      delete reviews[id];
    },
    listModels: async () => {
      calls.push('models');
      return 6;
    },
    save: (id, summary) => void (saved[id] = summary),
    saved: (id) => saved[id] ?? null,
    publish: (state) => void published.push(state),
    // o cofre de verdade mascara o que guardou; aqui, a chave da ferramenta
    redact: (text) => [...keys.values()].reduce((acc, key) => acc.split(key).join('[credencial local]'), text),
    now: () => 1_700_000_000_000,
    ...over,
  };
  return { connector: new Connector(deps), deps, profiles, keys, reviews, saved, published, calls };
}

describe('Conectar o Gemini em ACP, passo a passo', () => {
  it('locate → pede a chave → authenticate e verify → ciência → modelos → Conectada', async () => {
    const h = host();
    // 1. Conectar: acha a CLI e para no campo da chave, sem ligar o perfil (ligado, ele seria verificado sem a chave)
    const first = await h.connector.connect('gemini');
    expect(first).toMatchObject({ step: 'signIn', status: 'waiting', needs: 'api-key', summary: { version: '0.65.0' } });
    expect(h.calls).toEqual([]);
    expect(h.profiles.get('gemini')!.enabled).toBe(false);

    // 2. a chave colada vai para o cofre e para o authenticate; só então o perfil liga, e o verify dá o compatível
    const second = await h.connector.connect('gemini', { apiKey: `  ${KEY}\n` });
    expect(h.keys.get('gemini')).toBe(KEY);
    expect(h.calls).toEqual([`authenticate:gemini-api-key:${KEY}`, 'enable:gemini', 'verify:gemini']);
    expect(second).toMatchObject({
      step: 'review',
      status: 'waiting',
      needs: 'review',
      summary: { signIn: 'api-key', regime: 'compatible' },
    });

    // 3. a ciência retoma de onde parou (sem sondar de novo), grava a revisão do perfil e lê os modelos
    const done = await h.connector.connect('gemini', { acknowledge: true });
    expect(h.calls.slice(3)).toEqual(['models']);
    expect(h.reviews).toEqual({ gemini: 1 });
    expect(done).toMatchObject({ step: 'models', status: 'connected' });
    expect(h.saved.gemini).toEqual({
      version: '0.65.0',
      signIn: 'api-key',
      regime: 'compatible',
      reviewed: 1,
      models: 6,
      at: 1_700_000_000_000,
    });

    // a tela recebeu cada passo, e nenhum estado publicado carrega a chave
    expect(h.published.map((s) => `${s.step}:${s.status}`)).toContain('verify:running');
    expect(JSON.stringify(h.published)).not.toContain(KEY);
    expect(JSON.stringify(done)).not.toContain(KEY);
  });

  it('Reconectar com a chave e a ciência já gravadas vai direto a Conectada', async () => {
    const h = host();
    h.keys.set('gemini', KEY);
    h.reviews.gemini = 3;
    const state = await h.connector.connect('gemini');
    expect(state).toMatchObject({ status: 'connected', summary: { reviewed: 3, regime: 'compatible' } });
    // a revisão não sobe sozinha: só o clique da pessoa a grava
    expect(h.reviews.gemini).toBe(3);
  });

  it('o resumo gravado é o estado do perfil depois de reabrir o editor', async () => {
    const h = host();
    h.keys.set('gemini', KEY);
    await h.connector.connect('gemini', { acknowledge: true });
    const reopened = new Connector(h.deps);
    expect(reopened.snapshot(['gemini', 'claude'])).toEqual({
      gemini: { profileId: 'gemini', step: 'models', status: 'connected', summary: h.saved.gemini },
    });
  });

  it('o perfil fica "em conexão" antes de qualquer efeito: o host vê isso já no ligar o perfil', async () => {
    let activeWhenEnabled: boolean | null = null;
    const h = host({ enable: (id) => void (activeWhenEnabled = h.connector.active(id)) });
    h.keys.set('gemini', KEY);
    const pending = h.connector.connect('gemini');
    // marcado de forma síncrona, antes de o fluxo começar
    expect(h.connector.active('gemini')).toBe(true);
    await pending;
    expect(activeWhenEnabled).toBe(true);
  });

  it('o perfil que passa a provar o exclusivo perde a ciência antiga', async () => {
    const h = host({ verify: async () => ({ evidence: evidence('cli') }) });
    h.reviews.claude = 2;
    expect(await h.connector.connect('claude')).toMatchObject({ status: 'connected', summary: { regime: 'exclusive', reviewed: null } });
    expect(h.calls).toContain('revoke:claude');
    expect(h.reviews).toEqual({});
  });

  it('cópia ou personalizado não passam pelo Conectar (só o perfil pronto do catálogo)', async () => {
    const h = host();
    h.profiles.set('claude-2', { ...ready('claude'), id: 'claude-2', name: 'Claude cópia' });
    await expect(h.connector.connect('claude-2')).rejects.toThrow(/o Conectar é das ferramentas do catálogo/);
  });

  it('dois cliques seguidos viram uma conexão só', async () => {
    const h = host();
    h.keys.set('gemini', KEY);
    h.reviews.gemini = 1;
    const [a, b] = await Promise.all([h.connector.connect('gemini'), h.connector.connect('gemini')]);
    expect(a).toEqual(b);
    expect(h.calls.filter((c) => c.startsWith('verify'))).toHaveLength(1);
  });
});

describe('Conectar: o erro fica preso ao passo, com "Tentar de novo"', () => {
  it('locate: a CLI não está no PATH; a página oficial vai junto', async () => {
    const h = host({ locate: () => null });
    const state = await h.connector.connect('gemini');
    expect(state).toMatchObject({ step: 'locate', status: 'failed', docs: 'https://geminicli.com/docs/cli/acp-mode' });
    expect(state.error).toContain('`gemini`');
    // sem a ferramenta, o perfil não é ligado
    expect(h.calls).not.toContain('enable:gemini');
    expect(h.profiles.get('gemini')!.enabled).toBe(false);
    // "Tentar de novo" é o mesmo pedido: com a CLI instalada, segue
    h.deps.locate = () => '/usr/local/bin/gemini';
    expect(await h.connector.connect('gemini')).toMatchObject({ step: 'signIn', needs: 'api-key' });
  });

  it('login: chave fora do formato não chega ao cofre', async () => {
    const h = host();
    const state = await h.connector.connect('gemini', { apiKey: 'com espaço no meio' });
    expect(state).toMatchObject({ step: 'signIn', status: 'waiting', needs: 'api-key' });
    expect(state.error).toMatch(/uma linha só, sem espaços/);
    expect(h.keys.size).toBe(0);
  });

  it('login: o agente recusa a chave; o campo volta, e a mensagem não repete a chave', async () => {
    const h = host({
      authenticate: async (_p, _e, auth) => {
        throw new Error(`Gemini CLI recusou a chave de API: chave ${auth.apiKey} inválida`);
      },
    });
    const state = await h.connector.connect('gemini', { apiKey: KEY });
    expect(state).toMatchObject({ step: 'signIn', status: 'waiting', needs: 'api-key' });
    expect(state.error).toBe('Gemini CLI recusou a chave de API: chave [credencial local] inválida');
    expect(JSON.stringify(h.published)).not.toContain(KEY);
  });

  it('trocar a chave: a nova recusada não substitui a guardada (só sai a antiga depois de a nova passar)', async () => {
    let accepted = KEY;
    const h = host({
      authenticate: async (_p, _e, auth) => {
        if (auth.apiKey !== accepted) throw new Error('chave recusada');
      },
    });
    expect(await h.connector.connect('gemini', { apiKey: KEY })).toMatchObject({ summary: { signIn: 'api-key' } });
    const other = 'AIzaSy-outra-chave-recusada-99';
    expect(await h.connector.connect('gemini', { apiKey: other })).toMatchObject({ step: 'signIn', status: 'waiting', needs: 'api-key' });
    expect(h.keys.get('gemini')).toBe(KEY);
    // aceita, ela entra no lugar da antiga
    accepted = other;
    await h.connector.connect('gemini', { apiKey: other });
    expect(h.keys.get('gemini')).toBe(other);
  });

  it('verify: o agente recusou a sessão com a chave guardada → de volta ao campo da chave', async () => {
    const h = host({ verify: async () => ({ evidence: evidence('acp', { 'conversation/fresh-session': 'failed' }), authRequired: true }) });
    h.keys.set('gemini', KEY);
    expect(await h.connector.connect('gemini')).toMatchObject({ step: 'signIn', status: 'waiting', needs: 'api-key' });
  });

  it('verify: sem permissões, MCP ou delegação provadas não há regime; o passo diz os pendentes', async () => {
    const h = host({ verify: async () => ({ evidence: evidence('acp', { 'mcp/session-servers': 'failed' }) }) });
    h.keys.set('gemini', KEY);
    const state = await h.connector.connect('gemini');
    expect(state).toMatchObject({ step: 'verify', status: 'failed' });
    expect(state.error).toContain('mcp/session-servers');
  });

  it('verify: a sondagem que lança fica no passo dela', async () => {
    const h = host({
      verify: async () => {
        throw new Error('Ambiente gerenciado não verificado; recibos não são gravados.');
      },
    });
    h.keys.set('gemini', KEY);
    expect(await h.connector.connect('gemini')).toMatchObject({
      step: 'verify',
      status: 'failed',
      error: 'Ambiente gerenciado não verificado; recibos não são gravados.',
    });
  });

  it('modelos: a leitura que falha fica no passo dela, e a ciência já gravada não é pedida de novo', async () => {
    let fail = true;
    const h = host({
      listModels: async () => {
        if (fail) throw new Error('Gemini CLI não anunciou modelos na sessão.');
        return 6;
      },
    });
    h.keys.set('gemini', KEY);
    const state = await h.connector.connect('gemini', { acknowledge: true });
    expect(state).toMatchObject({ step: 'models', status: 'failed', error: 'Gemini CLI não anunciou modelos na sessão.' });
    expect(h.reviews.gemini).toBe(1);
    fail = false;
    const before = h.calls.length;
    // "Tentar de novo" (até com o clique da ciência repetido) retoma dos modelos: sem login, sondas nem revisão nova
    expect(await h.connector.connect('gemini', { acknowledge: true })).toMatchObject({ status: 'connected', summary: { reviewed: 1 } });
    // nada de authenticate nem verify (os modelos deste host falso não aparecem em `calls`)
    expect(h.calls.slice(before)).toEqual([]);
    expect(h.reviews.gemini).toBe(1);
  });

  it('ciência que falha ao gravar: "Tentar de novo" retoma da ciência, sem refazer as sondas', async () => {
    let broken = true;
    const h = host({
      recordReview: () => {
        if (broken) throw new Error('banco indisponível');
        return 1;
      },
    });
    h.keys.set('gemini', KEY);
    await h.connector.connect('gemini');
    expect(await h.connector.connect('gemini', { acknowledge: true })).toMatchObject({ step: 'review', status: 'failed' });
    broken = false;
    const before = h.calls.length;
    expect(await h.connector.connect('gemini', { acknowledge: true })).toMatchObject({ status: 'connected', summary: { reviewed: 1 } });
    expect(h.calls.slice(before)).toEqual(['models']);
  });
});

describe('Conectar as outras ferramentas: o mesmo fluxo, pelo auth de cada driver', () => {
  it('Claude Code: login pelo terminal; sem login, o passo traz o comando', async () => {
    const h = host({ signedIn: async () => false });
    const state = await h.connector.connect('claude');
    expect(state).toMatchObject({ step: 'signIn', status: 'failed', command: 'claude auth login' });
  });

  it('Claude Code: as cinco capacidades provadas → exclusivo, sem ciência; a lista de modelos é a embutida', async () => {
    const h = host({ verify: async () => ({ evidence: evidence('cli') }), listModels: async () => null });
    const state = await h.connector.connect('claude');
    expect(state).toMatchObject({
      status: 'connected',
      summary: { signIn: 'signed-in', regime: 'exclusive', reviewed: null, models: null },
    });
    expect(h.reviews).toEqual({});
    expect(h.calls).not.toContain('enable:claude');
  });

  it('Cursor: sem sonda de capacidades, o regime não se aplica e não há ciência', async () => {
    const h = host();
    const state = await h.connector.connect('cursor');
    expect(state).toMatchObject({ status: 'connected', summary: { regime: null, reviewed: null } });
    expect(h.calls.filter((c) => c.startsWith('verify'))).toEqual([]);
  });

  it('agente ACP sem login por chave (OpenCode): entra pelo terminal, e a recusa da sessão diz o comando', async () => {
    const h = host({ verify: async () => ({ evidence: evidence('acp', { 'conversation/fresh-session': 'failed' }), authRequired: true }) });
    const state = await h.connector.connect('opencode');
    expect(state).toMatchObject({ step: 'verify', status: 'failed' });
    expect(state.error).toContain('`opencode auth login`');
    expect(h.calls.some((c) => c.startsWith('authenticate'))).toBe(false);
  });

  it('perfil personalizado: fora do Conectar', async () => {
    await expect(host().connector.connect('pessoal')).rejects.toThrow(/perfil personalizado segue pelo formulário/);
  });
});

describe('Conectar o Gemini pelo cartão API (história 10): o mesmo perfil, o modo trocável, a chave conferida', () => {
  it('sem binário: pede a chave, confere com a API, grava o modo api, liga o perfil, exclusivo sem ciência, modelos', async () => {
    const h = host({ locate: () => null });
    // o perfil está no ACP; o cartão é o da API
    expect(await h.connector.connect('gemini', { mode: 'api' })).toMatchObject({
      mode: 'api',
      step: 'signIn',
      status: 'waiting',
      needs: 'api-key',
      summary: { version: null },
    });
    expect(h.profiles.get('gemini')!.mode).toBe('acp');
    const done = await h.connector.connect('gemini', { mode: 'api', apiKey: KEY });
    expect(h.calls).toEqual([`check:${KEY}`, 'mode:gemini:api', 'enable:gemini', 'models']);
    expect(done).toMatchObject({
      mode: 'api',
      status: 'connected',
      summary: { signIn: 'api-key-checked', regime: 'exclusive', reviewed: null },
    });
    expect(h.profiles.get('gemini')!.mode).toBe('api');
    expect(h.keys.get('gemini')).toBe(KEY);
    expect(JSON.stringify(h.published)).not.toContain(KEY);
  });

  it('a mesma chave do ACP serve à API, e a conferência acontece sem pedir a chave de novo', async () => {
    const h = host({ locate: () => null });
    h.keys.set('gemini', KEY);
    expect(await h.connector.connect('gemini', { mode: 'api' })).toMatchObject({ status: 'connected' });
    expect(h.calls[0]).toBe(`check:${KEY}`);
  });

  it('a API recusa a chave: o modo e a chave guardada não mudam, e o erro não repete a chave', async () => {
    const h = host({
      locate: () => null,
      checkApiKey: async (_p, key) => {
        throw new Error(`A API do Gemini recusou a chave (HTTP 400, INVALID_ARGUMENT): API key ${key} not valid`);
      },
    });
    h.keys.set('gemini', 'AIzaSy-a-chave-que-ja-funciona');
    const state = await h.connector.connect('gemini', { mode: 'api', apiKey: KEY });
    expect(state).toMatchObject({ step: 'signIn', status: 'waiting', needs: 'api-key' });
    expect(state.error).toBe('A API do Gemini recusou a chave (HTTP 400, INVALID_ARGUMENT): API key [credencial local] not valid');
    expect(h.keys.get('gemini')).toBe('AIzaSy-a-chave-que-ja-funciona');
    expect(h.profiles.get('gemini')!.mode).toBe('acp');
    expect(JSON.stringify(h.published)).not.toContain(KEY);
  });

  it('a ciência do ACP sai ao conectar a API (exclusivo); o cartão ACP volta o perfil ao ACP', async () => {
    const h = host({ locate: (p) => (p.mode === 'api' ? null : '/usr/local/bin/gemini') });
    h.keys.set('gemini', KEY);
    h.reviews.gemini = 2;
    await h.connector.connect('gemini', { mode: 'api' });
    expect(h.reviews.gemini).toBeUndefined();
    const back = await h.connector.connect('gemini', { mode: 'acp' });
    expect(back).toMatchObject({ mode: 'acp', step: 'review', needs: 'review' });
    expect(h.profiles.get('gemini')!.mode).toBe('acp');
  });

  it('a recusa que outra camada cortou no meio da chave sai sem pedaço dela (no ACP e na API)', async () => {
    // o erro já chega cortado com reticências, no meio da chave: o Conectar mascara também o começo dela
    const cutAt = (key: string) => `${'w'.repeat(280)} ${key.slice(0, 14)}…`;
    const acp = host({
      authenticate: async (_p, _e, auth) => {
        throw new Error(cutAt(auth.apiKey));
      },
    });
    const viaAcp = await acp.connector.connect('gemini', { apiKey: KEY });
    expect(viaAcp.error).toMatch(/\[credencial local\]…$/);
    expect(viaAcp.error).not.toContain(KEY.slice(0, 8));
    const api = host({
      locate: () => null,
      checkApiKey: async (_p, key) => {
        throw new Error(cutAt(key));
      },
    });
    const viaApi = await api.connector.connect('gemini', { mode: 'api', apiKey: KEY });
    expect(viaApi.error).not.toContain(KEY.slice(0, 8));
    expect(JSON.stringify([...acp.published, ...api.published])).not.toContain(KEY.slice(0, 8));
  });

  it('um modo que a ferramenta não oferece é recusado', async () => {
    await expect(host().connector.connect('gemini', { mode: 'cli' })).rejects.toThrow('o modo CLI não é oferecido');
    await expect(host().connector.connect('claude', { mode: 'api' })).rejects.toThrow('o modo API não é oferecido');
  });
});

describe('regimeFromEvidence: o regime é consequência do que o modo prova', () => {
  it('ACP: compatível (os arquivos de contexto do agente nunca têm prova)', () => {
    expect(regimeFromEvidence('acp', ACP_PROVEN())).toEqual({ regime: 'compatible' });
  });
  it('CLI com as cinco provadas: exclusivo; com os artefatos falhos: compatível', () => {
    expect(regimeFromEvidence('cli', evidence('cli'))).toEqual({ regime: 'exclusive' });
    expect(regimeFromEvidence('cli', evidence('cli', { 'artifacts/user-sentinel': 'failed' }))).toEqual({ regime: 'compatible' });
  });
  it('sem o mínimo da admissão: null com os pendentes', () => {
    expect(regimeFromEvidence('cli', evidence('cli', { 'permissions/forbidden-tool': 'failed' }))).toEqual({
      regime: null,
      pending: ['permissions/forbidden-tool'],
    });
    expect(regimeFromEvidence('acp', [])).toMatchObject({ regime: null });
  });
});
