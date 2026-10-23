import { describe, expect, it } from 'vitest';
import { ACP_AGENTS } from '../src/extension/ai/acp/agents';
import { acpMeasure } from '../src/extension/ai/acp/provider';
import { allDrivers, driverFor, driverOf } from '../src/extension/ai/drivers';
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

  it('o Gemini recomenda a API, ainda planejada: sem selo até a história do modo API; o Claude só tem a CLI', () => {
    const gemini = TOOLS.find((t) => t.id === 'gemini')!;
    expect(gemini.modes.map((m) => m.mode)).toEqual(['acp']);
    expect(gemini.planned.map((p) => p.mode).sort()).toEqual(['api', 'cli']);
    expect(gemini.recommended.mode).toBe('api');
    expect(recommendedOffered(gemini)).toBeNull();
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
    expect(driver.auth).toEqual({ kind: 'acp-authenticate', terminal: agent.login });
    expect(driver.install('unix')).toEqual([]);
    // o agente não tem comando de status: a sonda não roda nada
    expect(await driver.signedIn({ homeDir: '/home', query: () => Promise.reject(new Error('não deveria consultar')) })).toBeNull();
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
