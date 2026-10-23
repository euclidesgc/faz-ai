import { describe, expect, it } from 'vitest';
import {
  ACP_CAPABILITY_CHECKS,
  admitExecution,
  assessCapability,
  CAPABILITY_CHECKS,
  EXECUTOR_CAPABILITIES,
  type CapabilityEvidence,
  type StrictExecutionRequest,
} from '../src/shared/executionAdmission';

const BINDING = 'b'.repeat(64);
const NOW = 1000;
const request = (over: Partial<StrictExecutionRequest> = {}): StrictExecutionRequest => ({
  version: 1,
  regime: 'exclusive',
  boardTools: { mode: 'inherit' },
  mcpLevel: { permission: 'full', tools: [] },
  agentTools: { categories: ['read', 'edit', 'run'], native: { tool: '', allow: [], deny: [] } },
  activeMcpIds: [],
  allowedMcpIds: [],
  boardMcpIds: [],
  mcpTools: [],
  boardMcpTools: [],
  mcpServers: [],
  ...over,
});
/** Recibos sintéticos do verificador para testar a decisão. Não verificam nenhuma CLI real. */
export const evidence = (binding = BINDING, checkedAt = NOW - 100): CapabilityEvidence[] =>
  EXECUTOR_CAPABILITIES.map((capability) => ({
    version: 1,
    capability,
    binding,
    source: 'host-probe',
    checkedAt,
    expiresAt: NOW + 1000,
    checks: CAPABILITY_CHECKS[capability].map((id) => ({ id, outcome: 'passed', receipt: 'a'.repeat(64) })),
  }));
const decide = (r = request(), e = evidence(), permission: 'board' | 'edits' | 'full' = 'full') =>
  admitExecution('claude', permission, { ...r, mcpLevel: { ...r.mcpLevel, permission } }, BINDING, e, NOW);

describe('admissão por capacidades', () => {
  it('exige cinco capacidades independentes, sem deduzir verificação de listas vazias', () => {
    const d = decide(request(), []);
    expect(d.state).toBe('blocked');
    expect(d.reasons).toHaveLength(5);
    expect(d.capabilities.every((c) => c.state === 'unknown')).toBe(true);
    expect(decide().state).toBe('admitted');
  });
  it.each(EXECUTOR_CAPABILITIES)('bloqueia quando falta a capacidade %s, mesmo com as outras verificadas', (cap) => {
    expect(
      decide(
        request(),
        evidence().filter((e) => e.capability !== cap),
      ).reasons,
    ).toContainEqual({ code: 'capability-not-verified', capability: cap });
  });
  it('ausência, falha, recibos inválidos, expiração e alteração de vínculo nunca viram sucesso', () => {
    const good = evidence()[0]!;
    for (const row of [
      { ...good, checks: [] },
      { ...good, checks: good.checks.map((c) => ({ ...c, outcome: 'failed' as const })) },
      { ...good, checks: good.checks.map((c) => ({ ...c, outcome: 'unavailable' as const })) },
      { ...good, checks: good.checks.map((c) => ({ ...c, receipt: 'OK' })) },
      { ...good, expiresAt: NOW },
      { ...good, checkedAt: NOW + 1 },
      { ...good, binding: 'outra-copia' },
      { ...good, source: 'manual' as never },
      { ...good, checks: [...good.checks, ...good.checks] },
    ])
      expect(assessCapability('conversation', BINDING, [row], NOW).state).not.toBe('verified');
  });
  it('uma falha nova ou empatada não recorre ao sucesso anterior', () => {
    const good = evidence()[0]!;
    const bad = { ...good, checkedAt: NOW - 10, checks: good.checks.map((c) => ({ ...c, outcome: 'failed' as const })) };
    expect(assessCapability('conversation', BINDING, [good, bad], NOW)).toMatchObject({ state: 'partial', reason: 'failed' });
    expect(assessCapability('conversation', BINDING, [good, { ...bad, checkedAt: good.checkedAt }], NOW)).toMatchObject({
      state: 'partial',
    });
  });
  it('compatibilidade exige revisão humana e não dispensa permissões, MCP e delegação', () => {
    const partial = evidence().filter((e) => e.capability !== 'artifacts' && e.capability !== 'conversation');
    expect(decide(request({ regime: 'compatible' }), partial).reasons).toContainEqual({ code: 'compatibility-not-reviewed' });
    const reviewed = request({ regime: 'compatible', compatibilityReview: { actor: 'person', revision: 2 } });
    expect(decide(reviewed, partial).state).toBe('admitted');
    expect(
      decide(
        reviewed,
        partial.filter((e) => e.capability !== 'permissions'),
      ).state,
    ).toBe('blocked');
    expect(decide(request(), partial).state).toBe('blocked');
  });
  it('intersecta board, nível e agente e distingue herança de vazio explícito', () => {
    expect(decide(request(), evidence(), 'board').tools).toContain('Read');
    expect(decide(request(), evidence(), 'board').tools).not.toContain('Edit');
    expect(decide(request(), evidence(), 'edits').tools).toContain('Edit');
    expect(decide(request(), evidence(), 'edits').tools).not.toContain('Bash');
    expect(decide(request({ boardTools: { mode: 'explicit', value: [] } })).tools).toEqual([]);
    expect(decide(request({ agentTools: { categories: [], native: { tool: '', allow: [], deny: [] } } })).tools).toEqual([]);
    expect(decide(request({ agentTools: { categories: ['read'], native: { tool: 'claude', allow: [], deny: [] } } })).tools).toEqual([]);
  });
  it('restrições nativas não ampliam categorias e a delegação permanece negada', () => {
    const d = decide(
      request({
        agentTools: { categories: ['read', 'agents'], native: { tool: 'claude', allow: ['Read', 'Edit', 'Agent'], deny: ['Read'] } },
      }),
    );
    expect(d.tools).toEqual([]);
    expect(d.deniedTools).toContain('Agent');
    expect(d.deniedTools).toContain('Task');
  });
  it('recusa nomes nativos de outro executor, restrições sem executor e padrões sem tradução comprovada', () => {
    expect(decide(request({ agentTools: { categories: ['read'], native: { tool: 'kimi', allow: [], deny: [] } } })).reasons).toContainEqual(
      { code: 'native-executor-mismatch' },
    );
    expect(
      decide(request({ agentTools: { categories: ['read'], native: { tool: '', allow: ['Read'], deny: [] } } })).reasons,
    ).toContainEqual({ code: 'native-executor-required' });
    expect(
      decide(request({ agentTools: { categories: ['run'], native: { tool: 'claude', allow: ['Bash(git *)'], deny: [] } } })).reasons,
    ).toContainEqual({ code: 'unsupported-native-restriction' });
  });
  it('conhece o Gemini (ferramenta por modo, história 5): agente nativo dele não é pedido inválido', () => {
    const gemini = (allow: string[]) => request({ agentTools: { categories: ['read'], native: { tool: 'gemini', allow, deny: [] } } });
    // no executor Claude é outro executor, não um pedido malformado
    expect(decide(gemini([])).reasons).toContainEqual({ code: 'native-executor-mismatch' });
    expect(decide(gemini([])).reasons).not.toContainEqual({ code: 'invalid-request' });
    // no executor Gemini (o modo CLI, história 8) os nomes da tabela dele são reconhecidos e traduzidos pelo nível
    const own = admitExecution(
      'gemini',
      'board',
      { ...gemini(['read_file']), mcpLevel: { permission: 'board', tools: [] } },
      BINDING,
      evidence(),
      NOW,
    );
    expect(own.reasons).not.toContainEqual({ code: 'unsupported-native-restriction' });
    expect(own.tools).toEqual(['read_file']);
    // o perfil ACP do Gemini entra na admissão como `generic`: nenhuma ferramenta nativa traduzida, como antes
    const acp = admitExecution(
      'generic',
      'board',
      { ...request(), mcpLevel: { permission: 'board', tools: [] } },
      BINDING,
      evidence(),
      NOW,
      'acp',
    );
    expect(acp.tools).toEqual([]);
  });
  it('MCP permitido sem seleção não é ativado e MCP fora dos limites é recusado', () => {
    const r = request({ mcpServers: [{ artifactId: 'm', name: 'memoria' }], allowedMcpIds: ['m'], boardMcpIds: ['m'] });
    expect(decide(r).activeMcpIds).toEqual([]);
    expect(decide({ ...r, activeMcpIds: ['m'] }).activeMcpIds).toEqual(['m']);
    expect(decide({ ...r, activeMcpIds: ['fora'] }).reasons).toContainEqual({ code: 'mcp-outside-boundary', resourceId: 'fora' });
  });
  it('operações MCP, inclusive do board, precisam estar nos limites exatos; leitura não concede mutação', () => {
    const name = 'mcp__faz-ai__move_card';
    const r = request({ mcpTools: [name], boardMcpTools: [name], mcpLevel: { permission: 'full', tools: [name] } });
    expect(decide(r).state).toBe('blocked');
    expect(decide({ ...r, agentTools: { categories: ['read'], native: { tool: 'claude', allow: [name], deny: [] } } }).mcpTools).toEqual([
      name,
    ]);
    expect(decide({ ...r, boardMcpTools: [] }).state).toBe('blocked');
    expect(decide({ ...r, mcpLevel: { permission: 'full', tools: [] } }).state).toBe('blocked');
    expect(admitExecution('claude', 'board', r, BINDING, evidence(), NOW).state).toBe('blocked');
  });
  it('um nome de operação não seleciona outro servidor nem aceita curingas ou aliases ambíguos', () => {
    const name = 'mcp__outro__write';
    const r = request({
      mcpTools: [name],
      boardMcpTools: [name],
      agentTools: { categories: [], native: { tool: 'claude', allow: [name], deny: [] } },
    });
    expect(decide(r).reasons).toContainEqual({ code: 'mcp-operation-outside-boundary', resourceId: name });
    expect(decide({ ...r, mcpTools: ['mcp__outro__*'] }).reasons).toContainEqual({ code: 'invalid-request' });
    expect(
      decide({
        ...r,
        mcpServers: [
          { artifactId: 'a', name: 'igual' },
          { artifactId: 'b', name: 'igual' },
        ],
      }).reasons,
    ).toContainEqual({ code: 'invalid-request' });
  });
  it('outro provider não recebe tradução detalhada por usar evidências de teste completas', () => {
    expect(admitExecution('cursor', 'full', request(), BINDING, evidence(), NOW).reasons).toContainEqual({
      code: 'tool-mapping-unavailable',
    });
  });
  it('no transporte ACP a tradução é a do protocolo: sem ferramentas nativas, com os checks do handshake', () => {
    const acp = (binding = BINDING): CapabilityEvidence[] =>
      EXECUTOR_CAPABILITIES.map((capability) => ({
        version: 1,
        capability,
        binding,
        source: 'host-probe',
        checkedAt: NOW - 100,
        expiresAt: NOW + 1000,
        checks: ACP_CAPABILITY_CHECKS[capability].map((id) => ({
          id,
          // os arquivos de contexto do agente nunca têm prova no ACP
          outcome: id === 'own-context-files' ? 'unavailable' : 'passed',
          receipt: 'a'.repeat(64),
        })),
      }));
    const exclusive = admitExecution('generic', 'full', request(), BINDING, acp(), NOW, 'acp');
    expect(exclusive.state).toBe('blocked');
    expect(exclusive.reasons).toEqual([{ code: 'capability-not-verified', capability: 'artifacts' }]);
    const reviewed = request({ regime: 'compatible', compatibilityReview: { actor: 'person', revision: 1 } });
    const compatible = admitExecution('generic', 'full', reviewed, BINDING, acp(), NOW, 'acp');
    expect(compatible.state).toBe('admitted');
    expect(compatible.tools).toEqual([]);
    expect(compatible.deniedTools).toEqual(['Agent', 'Task', 'SendMessage', 'ListAgents']);
    // os recibos da CLI (outros ids) não servem para o ACP, nem os do ACP para a CLI
    expect(admitExecution('generic', 'full', reviewed, BINDING, evidence(), NOW, 'acp').state).toBe('blocked');
    expect(admitExecution('claude', 'full', reviewed, BINDING, acp(), NOW, 'cli').state).toBe('blocked');
    // o genérico pela CLI continua sem tradução
    expect(admitExecution('generic', 'full', reviewed, BINDING, evidence(), NOW, 'cli').reasons).toContainEqual({
      code: 'tool-mapping-unavailable',
    });
  });
  it('a decisão é determinística e não modifica as entradas', () => {
    const r = request();
    const e = evidence();
    const before = JSON.stringify({ r, e });
    expect(decide(r, e)).toEqual(decide(r, e));
    const result = decide(r, e);
    result.tools.push('Edit');
    expect(JSON.stringify({ r, e })).toBe(before);
  });
});
