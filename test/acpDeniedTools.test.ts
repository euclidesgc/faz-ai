// As ferramentas negadas (e a lista `tools`) do card impostas em tempo real no ACP: o `boardDecision` traduz
// cada pedido de permissão do agente (o `kind` do protocolo, ou o nome interno do Gemini CLI) para o
// vocabulário do card pela mesma tabela da conferência (registro ferramenta-por-modo-acp-negadas).
import { describe, expect, it } from 'vitest';
import { boardDecision } from '../src/extension/ai/acp/run';
import { acpAgent, geminiToolOf } from '../src/extension/ai/acp/agents';
import type { AcpToolCall } from '../src/extension/ai/acp/provider';
import { apiCallDecision } from '../src/extension/ai/drivers/gemini/api';
import { checkRun, deniesMcpTool, equivalentsBreach, equivalentsOf } from '../src/shared/runCheck';
import type { RunnerPermission } from '../src/shared/runner';

const call = (kind: string | null, title = 'algo', native: string | null = null): AcpToolCall => ({
  toolCallId: 'c1',
  title,
  kind,
  native,
});
const exec = (tools: string[], deniedTools: string[]) => ({ tools, deniedTools });
const decide = (
  c: AcpToolCall,
  e = exec([], []),
  permission: RunnerPermission = 'full',
  mcp: { server: string; tool?: string } | null = null,
) => boardDecision(permission, c, mcp, ['faz-ai', 'srv'], e);

describe('boardDecision: deniedTools do card no vocabulário do ACP', () => {
  it('Bash negado recusa o execute, mesmo em full (o nível não afrouxa a negação)', () => {
    expect(decide(call('execute', 'npm test'), exec([], ['Bash']))).toEqual({
      allow: false,
      reason: 'a ferramenta Bash está negada no card',
    });
    // sem a negação, o full libera como antes
    expect(decide(call('execute', 'npm test'))).toEqual({ allow: true, reason: null });
  });

  it('delete e move têm Bash entre os equivalentes: Bash negado recusa os dois', () => {
    for (const kind of ['delete', 'move']) expect(decide(call(kind, 'src/a.ts'), exec([], ['Bash'])).allow).toBe(false);
    // e Edit negado também, que eles mudam arquivos
    expect(decide(call('move', 'src/a.ts'), exec([], ['Edit'])).allow).toBe(false);
  });

  it('cada kind com equivalente é recusado quando um deles está negado', () => {
    const cases: [string, string][] = [
      ['read', 'Read'],
      ['search', 'Grep'],
      ['search', 'Glob'],
      ['edit', 'Write'],
      ['fetch', 'WebFetch'],
    ];
    for (const [kind, denied] of cases) expect(decide(call(kind), exec([], [denied])), `${kind}/${denied}`).toMatchObject({ allow: false });
  });

  it('kinds sem equivalente (think, switch_mode, other) seguem a regra de antes', () => {
    for (const kind of ['think', 'switch_mode', 'other', null])
      expect(decide(call(kind, 'Pensando'), exec(['Read'], ['Bash', 'Read'])), String(kind)).toEqual({ allow: true, reason: null });
    // e no nível board, o other continua fora do nível, como antes
    expect(decide(call('other', 'Pensando'), exec([], []), 'board')).toEqual({ allow: false, reason: 'fora do nível board' });
  });

  it('um kind desconhecido não é lido como nome do card: vale o nível', () => {
    expect(decide(call('agent', 'x'), exec(['Read'], []))).toEqual({ allow: true, reason: null });
    expect(decide(call('agent', 'x'), exec(['Read'], []), 'edits').allow).toBe(false);
  });
});

describe('boardDecision: a lista tools do card é conferida, não imposta (como no modo API)', () => {
  it('kind sem nenhum equivalente na lista é liberado pelo nível: o desvio fica para a conferência', () => {
    expect(decide(call('execute', 'npm test'), exec(['Read', 'Grep'], []))).toEqual({ allow: true, reason: null });
    // um card que só lista MCP também não recusa nativa nenhuma
    expect(decide(call('edit'), exec(['mcp__srv__x'], [])).allow).toBe(true);
    // o nível continua valendo
    expect(decide(call('execute', 'npm test'), exec(['Read', 'Grep'], []), 'edits')).toEqual({
      allow: false,
      reason: 'fora do nível edits',
    });
  });

  it('o nome listado que também está negado continua negado (a negação decide primeiro)', () => {
    expect(decide(call('execute'), exec(['Bash'], ['Bash'])).reason).toBe('a ferramenta Bash está negada no card');
  });
});

describe('boardDecision: o nome interno do Gemini CLI, quando o pedido o traz', () => {
  it('o toolCallId do Gemini (`<nome>__<id>`) dá o nome da tabela; o resto fica para o kind', () => {
    expect(geminiToolOf('run_shell_command__abc123')).toBe('run_shell_command');
    expect(geminiToolOf('read_file__synth_p1_1_0')).toBe('read_file');
    expect(geminiToolOf('t4')).toBeNull();
    expect(geminiToolOf('__x')).toBeNull();
    // um nome que a tabela não conhece (MCP, subagente com nome próprio) não vira nome nativo
    expect(geminiToolOf('mcp_srv_x__abc')).toBeNull();
    expect(acpAgent('gemini')!.nativeToolOf).toBe(geminiToolOf);
    // os outros agentes do catálogo não carregam o nome no id: decidem pelo kind
    expect(acpAgent('opencode')?.nativeToolOf).toBeUndefined();
  });

  it('o nome vale antes do kind: run_shell_command com Bash negado é recusado mesmo com o kind other', () => {
    expect(decide(call('other', 'ls', 'run_shell_command'), exec([], ['Bash'])).reason).toBe('a ferramenta Bash está negada no card');
    // pelo kind other, sem o nome, nada seria recusado
    expect(decide(call('other', 'ls', null), exec([], ['Bash'])).allow).toBe(true);
    // PowerShell negado: pelo nome (Bash ou PowerShell) recusa; pelo kind execute (só Bash), não
    expect(decide(call('execute', 'dir', 'run_shell_command'), exec([], ['PowerShell'])).allow).toBe(false);
    expect(decide(call('execute', 'dir', null), exec([], ['PowerShell'])).allow).toBe(true);
  });

  it('activate_skill (kind other): Skill negado recusa; fora da lista tools, passa (conferência)', () => {
    expect(decide(call('other', 'activate_skill', 'activate_skill'), exec([], ['Skill'])).allow).toBe(false);
    expect(decide(call('other', 'activate_skill', 'activate_skill'), exec(['Read'], [])).allow).toBe(true);
    // nome sem equivalente (o tópico) nunca é recusado
    expect(decide(call('other', 'tópico', 'update_topic'), exec([], ['Bash'])).allow).toBe(true);
  });

  it('a delegação nativa do Gemini (invoke_agent) cai na negação da delegação', () => {
    expect(decide(call('think', 'revisor', 'invoke_agent'), exec([], ['Agent'])).allow).toBe(false);
  });
});

describe('boardDecision: ferramentas MCP negadas pelo nome do card', () => {
  const mcp = (tool: string) => ({ server: 'srv', tool });
  it('mcp__srv__x negado recusa a ferramenta x do servidor srv, e só ela', () => {
    expect(decide(call(null, 'x (srv MCP Server)'), exec([], ['mcp__srv__x']), 'full', mcp('x'))).toEqual({
      allow: false,
      reason: 'a ferramenta mcp__srv__x está negada no card',
    });
    expect(decide(call(null, 'y (srv MCP Server)'), exec([], ['mcp__srv__x']), 'full', mcp('y')).allow).toBe(true);
  });

  it('o servidor inteiro negado (`mcp__srv__*` ou `mcp__srv`) recusa qualquer ferramenta dele', () => {
    for (const entry of ['mcp__srv__*', 'mcp__srv'])
      expect(decide(call(null, 'y (srv MCP Server)'), exec([], [entry]), 'full', mcp('y')).allow, entry).toBe(false);
  });

  it('a lista tools e os kinds não se aplicam à ferramenta MCP: vale o servidor do card', () => {
    expect(decide(call('execute', 'x (srv MCP Server)'), exec(['Read'], ['Bash']), 'full', mcp('x')).allow).toBe(true);
  });

  it('o modo API pergunta pelo mesmo nome', () => {
    const input = { prompt: '', permission: 'full' as const, exec: { deniedTools: ['mcp__srv__x'], tools: [] } as never };
    expect(apiCallDecision(input, ['srv'], 'srv', 'x').allow).toBe(false);
    expect(apiCallDecision(input, ['srv'], 'srv', 'y').allow).toBe(true);
  });
});

describe('a regra única com a conferência', () => {
  it('deniesMcpTool escreve o servidor como o Claude Code (o que não é letra, número, _ ou - vira _)', () => {
    expect(deniesMcpTool('mcp__meu_srv__x', 'meu.srv', 'x')).toBe(true);
    expect(deniesMcpTool('mcp__srv__xy', 'srv', 'x')).toBe(false);
  });

  it('a decisão em tempo real recusa o que a conferência acusa por negação; a lista tools só a conferência', () => {
    const manifests = [exec([], ['Bash']), exec(['Read', 'Grep'], []), exec(['Edit'], ['Write']), exec([], [])];
    for (const kind of ['read', 'search', 'edit', 'delete', 'move', 'execute', 'fetch', 'think', 'switch_mode', 'other'])
      for (const m of manifests) {
        const check = checkRun(
          { measure: 'tokens', inventory: [{ kind: 'tool', name: kind, calls: 1 }] } as never,
          { ...m, skills: [], mcpServers: [], agent: null } as never,
          'faz-ai',
        );
        const breach = equivalentsBreach(equivalentsOf(kind, undefined)!, m);
        const refused = !decide(call(kind), m).allow;
        expect(breach !== null, `${kind} ${JSON.stringify(m)}`).toBe(check.status === 'deviation');
        expect(refused, `${kind} ${JSON.stringify(m)}`).toBe(breach !== null && 'denied' in breach);
      }
  });
});
