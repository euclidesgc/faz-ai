import { describe, expect, it } from 'vitest';
import { ACP_AGENTS } from '../src/extension/ai/acp/agents';
import { acpMeasure } from '../src/extension/ai/acp/provider';
import { allDrivers, driverFor, driverOf, executorOf } from '../src/extension/ai/drivers';
import { cliExecutor } from '../src/extension/ai/drivers/cli';
import { admissionTransport } from '../src/extension/ai/admission';
import { claudeProvider } from '../src/extension/ai/providers/claude';
import { cursorProvider } from '../src/extension/ai/providers/cursor';
import { kimiProvider } from '../src/extension/ai/providers/kimi';
import { ACP_READY_AGENTS, BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import { MODE_SHEET_LINES, TOOLS, recommendedOffered, toolModeOf } from '../src/shared/aiTools';
import { EXEC_ENFORCEMENT, enforcementOf } from '../src/shared/execution';
import { ALL_AI_BASES } from '../src/shared/harness';
import { CLI_COMMAND, LOGIN_COMMAND } from '../src/shared/requirements';

describe('catálogo de ferramentas (TOOLS) e drivers de conexão', () => {
  it('o Gemini vem primeiro, e todo perfil do catálogo tem a sua ferramenta em TOOLS', () => {
    expect(TOOLS[0]!.id).toBe('gemini');
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
    for (const p of BUILTIN_PROFILES) expect(TOOLS.map((t) => t.id)).toContain(toolModeOf(p)!.tool);
  });

  it.each(TOOLS.map((t) => [t.id, t] as const))('%s: um driver por modo oferecido, nenhum modo oferecido sem driver', (_id, tool) => {
    expect(tool.modes.length).toBeGreaterThan(0);
    for (const m of tool.modes) {
      const driver = driverFor(tool.id, m.mode);
      expect(driver, `${tool.id}/${m.mode}`).toBeDefined();
      expect(driver).toMatchObject({ tool: tool.id, mode: m.mode });
      // o que o board impõe é um dado só: a ficha do catálogo e o driver dizem o mesmo
      expect(driver!.enforcement).toEqual(m.enforcement);
    }
  });

  it.each(TOOLS.map((t) => [t.id, t] as const))('%s: o modo planejado não tem driver nem cartão', (_id, tool) => {
    // quando o driver de um modo planejado entrar, ele passa de `planned` para `modes`, com a ficha
    for (const p of tool.planned) {
      expect(driverFor(tool.id, p.mode), `${tool.id}/${p.mode}`).toBeUndefined();
      expect(tool.modes.map((m) => m.mode)).not.toContain(p.mode);
    }
  });

  it.each(TOOLS.map((t) => [t.id, t] as const))('%s: o modo recomendado é um dos da ferramenta, com o motivo', (_id, tool) => {
    expect([...tool.modes.map((m) => m.mode), ...tool.planned.map((p) => p.mode)]).toContain(tool.recommended.mode);
    expect(tool.recommended.reason.trim()).toMatch(/\.$/);
    // o selo só acende quando o recomendado é oferecido
    expect(recommendedOffered(tool)).toBe(tool.modes.some((m) => m.mode === tool.recommended.mode) ? tool.recommended.mode : null);
  });

  it('toda ficha tem as oito linhas, preenchidas', () => {
    expect(MODE_SHEET_LINES).toHaveLength(8);
    for (const tool of TOOLS)
      for (const m of tool.modes) {
        expect(Object.keys(m.sheet).sort(), `${tool.id}/${m.mode}`).toEqual([...MODE_SHEET_LINES].sort());
        for (const line of MODE_SHEET_LINES) expect(m.sheet[line].trim(), `${tool.id}/${m.mode}: ${line}`).not.toBe('');
      }
  });

  it('o Gemini oferece a API desde a história 10, e o selo Recomendado acende nela; o Claude só tem a CLI', () => {
    const gemini = TOOLS.find((t) => t.id === 'gemini')!;
    expect(gemini.modes.map((m) => m.mode)).toEqual(['acp', 'api']);
    expect(gemini.planned.map((p) => p.mode)).toEqual(['cli']);
    expect(gemini.recommended.mode).toBe('api');
    expect(recommendedOffered(gemini)).toBe('api');
    // até a história 11 o modo serve a Refinar, Resumir e Trabalhar com a permissão board: a ficha diz
    const api = gemini.modes.find((m) => m.mode === 'api')!;
    expect(api.sheet.whenToChoose).toMatch(/Refinar, Resumir e Trabalhar na fase com a permissão "Só o board"/);
    expect(api.enforcement).toEqual({ agent: 'advised', skills: 'advised', mcp: 'enforced', tools: 'enforced', model: 'enforced' });
    const claude = TOOLS.find((t) => t.id === 'claude')!;
    expect(claude.modes.map((m) => m.mode)).toEqual(['cli']);
    expect(recommendedOffered(claude)).toBe('cli');
  });

  it('os agentes ACP de TOOLS são os do catálogo ACP, com a mesma página', () => {
    for (const tool of TOOLS.filter((t) => t.modes.some((m) => m.mode === 'acp'))) {
      const agent = ACP_AGENTS.find((a) => a.id === tool.id);
      expect(agent, tool.id).toBeDefined();
      expect(ACP_READY_AGENTS.map((a) => a.id)).toContain(tool.id);
    }
    for (const ready of ACP_READY_AGENTS.filter((a) => a.id !== 'gemini'))
      expect(TOOLS.find((t) => t.id === ready.id)?.docs).toBe(ready.docs);
  });
});

describe('drivers das CLIs prontas: envolvem os providers atuais', () => {
  it.each([
    ['claude', claudeProvider],
    ['cursor', cursorProvider],
    ['kimi', kimiProvider],
  ] as const)('%s/cli mede o mesmo que o provider e usa o comando e o login de sempre', (tool, provider) => {
    const driver = driverFor(tool, 'cli')!;
    expect(driver.measure).toBe(provider.measure);
    expect(driver.command).toBe(CLI_COMMAND[tool]);
    expect(driver.auth).toEqual({ kind: 'login-command', command: LOGIN_COMMAND[tool] });
    expect(driver.versionArgs).toEqual(['--version']);
    expect(driver.install('unix').length).toBeGreaterThan(0);
    expect(driver.install('windows').length).toBeGreaterThan(0);
  });

  it('só as CLIs que listam modelos (Cursor e Kimi Code) têm listModels', () => {
    expect(driverFor('cursor', 'cli')!.listModels).toBeTypeOf('function');
    expect(driverFor('kimi', 'cli')!.listModels).toBeTypeOf('function');
    expect(driverFor('claude', 'cli')!.listModels).toBeUndefined();
    for (const d of allDrivers().filter((x) => x.mode === 'acp')) expect(d.listModels).toBeUndefined();
  });

  it('EXEC_ENFORCEMENT é a vista das CLIs prontas no catálogo, igual ao driver', () => {
    for (const base of ALL_AI_BASES) expect(EXEC_ENFORCEMENT[base]).toEqual(driverFor(base, 'cli')!.enforcement);
  });
});

describe('drivers ACP: envolvem ACP_AGENTS', () => {
  it.each(ACP_AGENTS.map((a) => [a.id, a] as const))('%s/acp tem o comando, a página e a medição do agente', async (id, agent) => {
    const driver = driverFor(id, 'acp')!;
    expect(driver).toMatchObject({ tool: id, mode: 'acp', command: agent.command, docs: agent.docs, measure: acpMeasure(agent) });
    // o agente com login por chave (o Gemini) entra pela tela; os outros, pelo terminal
    expect(driver.auth).toEqual(
      agent.apiKeyAuth
        ? { kind: 'api-key', methodId: agent.apiKeyAuth.methodId, terminal: agent.login }
        : { kind: 'acp-authenticate', terminal: agent.login },
    );
    expect(driver.install('unix')).toEqual([]);
    // o agente não tem comando de status: a sonda não roda nada
    expect(await driver.signedIn({ homeDir: '/home', query: () => Promise.reject(new Error('não deveria consultar')) })).toBeNull();
  });

  it('o Gemini entra por chave de API pelo protocolo, e a chave no cofre conta como login', async () => {
    const gemini = driverFor('gemini', 'acp')!;
    expect(gemini.auth).toEqual({ kind: 'api-key', methodId: 'gemini-api-key', terminal: 'gemini' });
    const query = () => Promise.reject(new Error('não deveria consultar'));
    expect(await gemini.signedIn({ homeDir: '/home', query, hasApiKey: true })).toBe(true);
    // sem a chave do board, "não verificado": o agente pode ter o login próprio (GEMINI_API_KEY)
    expect(await gemini.signedIn({ homeDir: '/home', query, hasApiKey: false })).toBeNull();
    // simetria: um agente sem login por chave não vira "conectado" por uma chave
    expect(await driverFor('opencode', 'acp')!.signedIn({ homeDir: '/home', query, hasApiKey: true })).toBeNull();
  });
});

describe('toolModeOf: o perfil para (ferramenta, modo) do driver, pelos campos da história 4', () => {
  const profile = (p: Partial<AiProfile>): AiProfile => ({
    id: 'x',
    name: 'X',
    enabled: true,
    kind: 'custom',
    tool: 'x',
    mode: 'cli',
    base: 'generic',
    config: {},
    position: 9,
    ...p,
  });

  it('pronto e cópia: a base pela CLI; agente ACP: o agente pelo ACP; CLI personalizada: sem driver', () => {
    expect(toolModeOf(BUILTIN_PROFILES.find((p) => p.id === 'claude')!)).toEqual({ tool: 'claude', mode: 'cli' });
    expect(toolModeOf(BUILTIN_PROFILES.find((p) => p.id === 'gemini')!)).toEqual({ tool: 'gemini', mode: 'acp' });
    expect(toolModeOf(profile({ id: 'meu-kimi', kind: 'catalog', tool: 'kimi', base: 'kimi' }))).toEqual({ tool: 'kimi', mode: 'cli' });
    expect(toolModeOf(profile({ id: 'meu-gemini', tool: 'meu-gemini', mode: 'acp', config: { acpAgent: 'gemini' } }))).toEqual({
      tool: 'gemini',
      mode: 'acp',
    });
    expect(toolModeOf(profile({ config: { command: 'minha-cli' } }))).toBeNull();
    expect(driverOf(profile({ config: { command: 'minha-cli' } }))).toBeUndefined();
    expect(driverOf(profile({ kind: 'catalog', tool: 'cursor', base: 'cursor' }))?.tool).toBe('cursor');
  });

  it('enforcementOf não muda: CLI pronta pela tabela, agente ACP com MCP garantido, personalizada só orientação', () => {
    const claude = BUILTIN_PROFILES.find((p) => p.id === 'claude')!;
    expect(enforcementOf(claude)).toMatchObject(EXEC_ENFORCEMENT.claude);
    const acp = { agent: 'advised', skills: 'advised', mcp: 'enforced', tools: 'advised', model: 'advised' };
    expect(enforcementOf(BUILTIN_PROFILES.find((p) => p.id === 'gemini')!)).toMatchObject(acp);
    // o agente ACP fora do catálogo da tela (Cursor pelo ACP, num personalizado) tem a linha do protocolo
    expect(enforcementOf(profile({ mode: 'acp', config: { acpAgent: 'cursor' } }))).toMatchObject(acp);
    expect(enforcementOf(profile({ config: { command: 'minha-cli' } }))).toMatchObject({
      agent: 'advised',
      skills: 'advised',
      mcp: 'advised',
      tools: 'advised',
      model: 'advised',
    });
  });
});

describe('executorOf: quem executa cada perfil (contrato de execução, história 6)', () => {
  const profile = (p: Partial<AiProfile>): AiProfile => ({
    id: 'x',
    name: 'X',
    enabled: true,
    kind: 'custom',
    tool: 'x',
    mode: 'cli',
    base: 'generic',
    config: {},
    position: 9,
    ...p,
  });
  const examples = (): AiProfile[] => [
    ...BUILTIN_PROFILES,
    profile({ id: 'copia', kind: 'catalog', tool: 'claude', base: 'claude' }),
    profile({ config: { command: 'minha-cli' } }),
    ...ACP_AGENTS.map((a) => profile({ id: `p-${a.id}`, tool: `p-${a.id}`, mode: 'acp', config: { acpAgent: a.id } })),
  ];

  it('todo driver registrado executa pelo transporte do seu modo', () => {
    for (const d of allDrivers()) expect(d.transport, `${d.tool}/${d.mode}`).toBe(d.mode);
  });

  it('pronto e cópia: o driver da ferramenta; agente ACP: o driver do agente do catálogo', () => {
    expect(executorOf(BUILTIN_PROFILES.find((p) => p.id === 'claude')!)).toBe(driverFor('claude', 'cli'));
    expect(executorOf(profile({ id: 'copia', kind: 'catalog', tool: 'claude', base: 'claude' }))).toBe(driverFor('claude', 'cli'));
    expect(executorOf(BUILTIN_PROFILES.find((p) => p.id === 'gemini')!)).toBe(driverFor('gemini', 'acp'));
    expect(executorOf(profile({ mode: 'acp', config: { acpAgent: 'cursor' } }))).toBe(driverFor('cursor', 'acp'));
  });

  it('CLI personalizada, sem driver de conexão: o executor genérico de CLI, o mesmo dos drivers de CLI', () => {
    const custom = profile({ config: { command: 'minha-cli' } });
    expect(driverOf(custom)).toBeUndefined();
    expect(executorOf(custom)).toBe(cliExecutor);
    expect(driverFor('claude', 'cli')!.run).toBe(cliExecutor.run);
    expect(driverFor('claude', 'cli')!.bindingContext).toBe(cliExecutor.bindingContext);
  });

  it('agente ACP desconhecido é recusado, com a mesma mensagem de antes', () => {
    expect(() => executorOf(profile({ mode: 'acp', config: { acpAgent: 'nao-existe' } }))).toThrow('Agente ACP desconhecido: nao-existe.');
  });

  it('o transporte do executor é o mesmo que a admissão confere', () => {
    for (const p of examples()) expect(executorOf(p).transport, p.id).toBe(admissionTransport(p));
  });

  it('o modo API do Gemini roda pelo driver dele (história 10); sem driver da API, o perfil é recusado com a causa', () => {
    expect(allDrivers().filter((d) => d.mode === 'api' || d.transport === 'api')).toEqual([driverFor('gemini', 'api')]);
    const api = profile({ id: 'gemini', kind: 'catalog', tool: 'gemini', mode: 'api' });
    expect(admissionTransport(api)).toBe('api');
    expect(executorOf(api)).toBe(driverFor('gemini', 'api'));
    expect(driverFor('gemini', 'api')).toMatchObject({ measure: 'tokens', command: '', auth: { kind: 'api-key' } });
    // uma ferramenta sem o laço da API não cai na CLI nem no ACP
    const other = profile({ id: 'claude', kind: 'catalog', tool: 'claude', mode: 'api', base: 'claude' });
    expect(() => executorOf(other)).toThrow('O modo API de Claude Code ainda não roda nesta versão da extensão.');
  });
});
